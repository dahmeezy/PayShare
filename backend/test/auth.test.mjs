import { after, before, beforeEach, describe, it } from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assert } from "chai";
import request from "supertest";
import { testMailer } from "./helpers.mjs";

let directory;
let usersFile;
let createApp;
let createMailer;
let server;
let mailer;
const account = {
  firstName: "Test", lastName: "User", email: "test@example.com",
  role: "worker", password: "password123", acceptTerms: true,
};
const register = (overrides = {}, client = request(server)) => client.post("/api/register").send({ ...account, ...overrides });
async function verified() {
  const agent = request.agent(server);
  assert.equal((await register({}, agent)).status, 201);
  assert.equal((await agent.post("/api/verify").send({ code: mailer.code(account.email) })).status, 200);
  return agent;
}

before(async () => {
  directory = await mkdtemp(join(tmpdir(), "payshare-auth-"));
  usersFile = join(directory, "users.json");
  process.env.PAYSHARE_USERS_FILE = usersFile;
  ({ createApp } = await import("../src/server.mjs"));
  ({ createMailer } = await import("../src/email.mjs"));
});

beforeEach(async () => {
  await rm(usersFile, { force: true });
  mailer = testMailer();
  server = createApp(undefined, {}, mailer);
});

after(async () => {
  if (directory) await rm(directory, { recursive: true, force: true });
});

describe('Auth API', () => {
  describe('POST /api/register', () => {
    it('should register a new user with valid data', async () => {
      const res = await register();

      assert.equal(res.status, 201);
      assert.exists(res.body.id);
      assert.equal(res.body.email, 'test@example.com');
      assert.equal(res.body.role, 'worker');
      assert.equal(res.body.name, 'Test User');
      assert.equal(res.body.firstName, 'Test');
      assert.equal(res.body.lastName, 'User');
      assert.isFalse(res.body.emailVerified);
      assert.isTrue(res.body.verificationRequired);
      assert.notProperty(res.body, 'password_hash');
    });

    it('should require first name, last name and agreement to the terms', async () => {
      for (const missing of [{ firstName: ' ' }, { lastName: undefined }, { acceptTerms: false }, { acceptTerms: 'true' }]) {
        assert.equal((await register(missing)).status, 400, JSON.stringify(missing));
      }
      assert.equal(mailer.outbox.length, 0);
    });

    it('should fail with duplicate email once it is verified', async () => {
      await verified();
      const res = await register({ firstName: 'Second' });
      assert.equal(res.status, 400);
      assert.include(res.body.error, 'already registered');
    });

    it('should let an unverified sign-up start again and sign the earlier one out', async () => {
      const first = request.agent(server);
      assert.equal((await register({}, first)).status, 201);
      assert.equal((await register({ password: 'another-password' })).status, 201);
      assert.equal((await first.get('/api/session')).status, 401);
      // Restarting does not skip the resend cooldown.
      assert.equal(mailer.outbox.length, 1);
    });

    it('should fail with short password', async () => {
      assert.equal((await register({ password: 'short' })).status, 400);
    });
  });

  describe('POST /api/login', () => {
    it('should login with valid credentials', async () => {
      // Register first
      assert.equal((await register()).status, 201);

      const res = await request(server)
        .post('/api/login')
        .send({
          email: 'test@example.com',
          password: 'password123',
        });

      assert.equal(res.status, 200);
      assert.exists(res.body.id);
      assert.equal(res.body.email, 'test@example.com');
    });

    it('should fail with wrong password', async () => {
      assert.equal((await register()).status, 201);
      const res = await request(server)
        .post('/api/login')
        .send({
          email: 'test@example.com',
          password: 'wrongpassword',
        });

      assert.equal(res.status, 401);
      assert.include(res.body.error, 'Invalid credentials');
    });

    it('should rate limit login attempts', async () => {
      // Register first
      assert.equal((await register()).status, 201);

      // The first five attempts fail authentication. The sixth is rate limited.
      for (let i = 0; i < 5; i++) {
        const attempt = await request(server)
          .post('/api/login')
          .send({
            email: 'test@example.com',
            password: 'wrongpassword',
          });
        assert.equal(attempt.status, 401);
      }

      // 6th attempt should be rate limited
      const res = await request(server)
        .post('/api/login')
        .send({
          email: 'test@example.com',
          password: 'wrongpassword',
        });

      assert.equal(res.status, 429);
    });
  });

  describe('POST /api/forgot', () => {
    it('should send reset link for existing email', async () => {
      await register({ email: 'forgot@example.com' });

      const res = await request(server)
        .post('/api/forgot')
        .send({ email: 'forgot@example.com' });

      assert.equal(res.status, 200);
      assert.exists(res.body.success);
    });

    it('should give generic success for non-existent email', async () => {
      const res = await request(server)
        .post('/api/forgot')
        .send({ email: 'nonexistent@example.com' });

      assert.equal(res.status, 200);
      assert.exists(res.body.success);
      // Should not reveal if email exists
      assert.notProperty(res.body, 'user');
    });
  });

  describe('email verification', () => {
    const wrong = code => code === '000000' ? '111111' : '000000';

    it('emails a code, never returns it, and unlocks the account only with it', async () => {
      const agent = request.agent(server);
      const res = await register({}, agent);
      const code = mailer.code(account.email);
      assert.match(code, /^\d{6}$/);
      assert.notInclude(JSON.stringify(res.body), code);
      assert.isTrue(res.body.verification.sent);
      assert.isAbove(res.body.verification.expiresAt, Date.now());
      assert.notInclude(await readFile(usersFile, 'utf8'), `"${code}"`);
      assert.equal((await agent.get('/api/workspace/projects')).status, 403);
      assert.equal((await agent.put('/api/preferences').send({ textSize: 'large' })).status, 403);
      assert.equal((await agent.post('/api/verify').send({ code: wrong(code) })).status, 400);
      const done = await agent.post('/api/verify').send({ code });
      assert.equal(done.status, 200);
      assert.isTrue(done.body.emailVerified);
      assert.notProperty(done.body, 'verification');
    });

    it('requires a session and a six-digit code', async () => {
      assert.equal((await request(server).post('/api/verify').send({ code: '123456' })).status, 401);
      const agent = request.agent(server);
      await register({}, agent);
      assert.equal((await agent.post('/api/verify').send({ code: '123' })).status, 400);
    });

    it('locks a code after five wrong attempts', async () => {
      const agent = request.agent(server);
      await register({}, agent);
      const code = mailer.code(account.email);
      for (let i = 0; i < 4; i++) assert.equal((await agent.post('/api/verify').send({ code: wrong(code) })).status, 400);
      assert.equal((await agent.post('/api/verify').send({ code: wrong(code) })).status, 429);
      assert.equal((await agent.post('/api/verify').send({ code })).status, 429);
    });

    it('rejects an expired code and sends a fresh one after the cooldown', async () => {
      const agent = request.agent(server);
      await register({}, agent);
      const code = mailer.code(account.email);
      assert.equal((await agent.post('/api/verify/resend')).status, 429);
      const users = JSON.parse(await readFile(usersFile, 'utf8'));
      Object.assign(users[account.email].verification, { expiresAt: Date.now() - 1, sentAt: Date.now() - 61_000 });
      await writeFile(usersFile, JSON.stringify(users));
      const expired = await agent.post('/api/verify').send({ code });
      assert.equal(expired.status, 410);
      assert.include(expired.body.error, 'expired');
      assert.equal((await agent.post('/api/verify/resend')).status, 200);
      assert.equal(mailer.outbox.length, 2);
      assert.equal((await agent.post('/api/verify').send({ code: mailer.code(account.email) })).status, 200);
    });

    it('says plainly when email delivery is not configured', async () => {
      const app = createApp(undefined, {}, createMailer({}));
      const agent = request.agent(app);
      const res = await register({}, agent);
      assert.equal(res.status, 201);
      assert.deepInclude(res.body.verification, { deliveryAvailable: false, sent: false });
      const resend = await agent.post('/api/verify/resend');
      assert.equal(resend.status, 503);
      assert.include(resend.body.error, 'no code was sent');
    });

    it('reports a provider failure without claiming the email was sent, and allows a retry', async () => {
      let fail = true;
      const flaky = { ...mailer, send: async message => { if (fail) throw new Error('HTTP 500'); await mailer.send(message); } };
      const agent = request.agent(createApp(undefined, {}, flaky));
      const res = await register({}, agent);
      assert.isFalse(res.body.verification.sent);
      assert.equal((await agent.post('/api/verify/resend')).status, 502);
      fail = false;
      assert.equal((await agent.post('/api/verify/resend')).status, 200);
      assert.equal(mailer.outbox.length, 1);
    });

    it('sends through the provider only when both settings exist', async () => {
      const calls = [];
      const send = async (url, options) => { calls.push({ url, options }); return new Response('{}', { status: 200 }); };
      assert.isFalse(createMailer({ RESEND_API_KEY: 'key' }, send).available);
      await createMailer({ RESEND_API_KEY: 'key', EMAIL_FROM: 'PayShare <no-reply@example.com>' }, send)
        .send({ to: 'a@example.com', subject: 'Code', text: '123456' });
      assert.equal(calls[0].url, 'https://api.resend.com/emails');
      assert.equal(calls[0].options.headers.Authorization, 'Bearer key');
      assert.deepEqual(JSON.parse(calls[0].options.body).to, ['a@example.com']);
    });

    it('keeps accounts created before verification existed working', async () => {
      await register();
      const users = JSON.parse(await readFile(usersFile, 'utf8'));
      for (const key of ['email_verified_at', 'onboarded_at', 'tour_seen_at', 'verification']) delete users[account.email][key];
      await writeFile(usersFile, JSON.stringify(users));
      const login = await request(server).post('/api/login').send({ email: account.email, password: account.password });
      assert.deepInclude(login.body, { verificationRequired: false, onboarded: true, tourPending: false });
    });
  });

  describe('onboarding, profile and preferences', () => {
    it('saves the role once, then onboarding and the tour', async () => {
      const agent = request.agent(server);
      await register({ role: undefined }, agent);
      const user = (await agent.post('/api/verify').send({ code: mailer.code(account.email) })).body;
      assert.isNull(user.role);
      assert.equal((await agent.get('/api/workspace/projects')).status, 403);
      assert.equal((await agent.post('/api/onboarding/complete')).status, 409);
      assert.equal((await agent.put('/api/onboarding/role').send({ role: 'admin' })).status, 400);
      assert.equal((await agent.put('/api/onboarding/role').send({ role: 'client' })).body.role, 'client');
      const done = (await agent.post('/api/onboarding/complete')).body;
      assert.isTrue(done.onboarded);
      assert.isTrue(done.tourPending);
      assert.equal((await agent.post('/api/onboarding/tour').send({ status: 'later' })).status, 400);
      await agent.post('/api/onboarding/tour').send({ status: 'skipped' });
      const login = await request(server).post('/api/login').send({ email: account.email, password: account.password });
      assert.deepInclude(login.body, { role: 'client', onboarded: true, tourPending: false });
    });

    it('persists names and preferences and rejects unsupported channels', async () => {
      const agent = await verified();
      const profile = await agent.put('/api/profile').send({ firstName: 'Ada', lastName: 'Obi' });
      assert.equal(profile.body.name, 'Ada Obi');
      await agent.put('/api/preferences').send({ notifications: { inApp: false }, appearance: 'dark' });
      await agent.put('/api/preferences').send({ notifications: { email: true } });
      for (const bad of [{ notifications: { sms: true } }, { notifications: { whatsapp: true } }, { language: 'yo' }, { appearance: 'blue' }]) {
        assert.equal((await agent.put('/api/preferences').send(bad)).status, 400, JSON.stringify(bad));
      }
      const saved = (await agent.get('/api/session')).body;
      assert.deepEqual(saved.preferences, { notifications: { email: true, inApp: false }, appearance: 'dark', textSize: 'default' });
      assert.deepEqual((await agent.get('/api/workspace/notifications')).body, { enabled: false, unread: 0, items: [] });
    });

    it('changes the password only with the current one and signs other devices out', async () => {
      const agent = await verified();
      const other = request.agent(server);
      await other.post('/api/login').send({ email: account.email, password: account.password });
      assert.equal((await agent.put('/api/password').send({ currentPassword: 'wrong-password', password: 'new-password-1' })).status, 403);
      assert.equal((await agent.put('/api/password').send({ currentPassword: account.password, password: 'new-password-1' })).status, 200);
      assert.equal((await agent.get('/api/session')).status, 200);
      assert.equal((await other.get('/api/session')).status, 401);
      assert.equal((await request(server).post('/api/login').send({ email: account.email, password: 'new-password-1' })).status, 200);
    });

    it('ends the session with the browser when "keep me logged in" is off', async () => {
      await verified();
      const login = body => request(server).post('/api/login').send({ email: account.email, password: account.password, ...body });
      assert.match((await login({})).headers['set-cookie'][0], /Max-Age/);
      assert.notMatch((await login({ remember: false })).headers['set-cookie'][0], /Max-Age|Expires/);
    });
  });
});
