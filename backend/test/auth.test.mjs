import { after, before, beforeEach, describe, it } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assert } from "chai";
import request from "supertest";

let directory;
let usersFile;
let createApp;
let server;
const register = () => request(server).post("/api/register").send({
  name: "Test User",
  email: "test@example.com",
  role: "worker",
  password: "password123",
});

before(async () => {
  directory = await mkdtemp(join(tmpdir(), "payshare-auth-"));
  usersFile = join(directory, "users.json");
  process.env.PAYSHARE_USERS_FILE = usersFile;
  ({ createApp } = await import("../src/server.mjs"));
});

beforeEach(async () => {
  await rm(usersFile, { force: true });
  server = createApp();
});

after(async () => {
  if (directory) await rm(directory, { recursive: true, force: true });
});

describe('Auth API', () => {
  describe('POST /api/register', () => {
    it('should register a new user with valid data', async () => {
      const res = await request(server)
        .post('/api/register')
        .send({
          name: 'Test User',
          email: 'test@example.com',
          role: 'worker',
          password: 'password123',
        });

      assert.equal(res.status, 201);
      assert.exists(res.body.id);
      assert.equal(res.body.email, 'test@example.com');
      assert.equal(res.body.role, 'worker');
    });

    it('should fail with duplicate email', async () => {
      // Register first
      assert.equal((await register()).status, 201);

      // Try again
      const res = await request(server)
        .post('/api/register')
        .send({
          name: 'Test User 2',
          email: 'test@example.com',
          role: 'worker',
          password: 'password123',
        });

      assert.equal(res.status, 400);
      assert.include(res.body.error, 'already registered');
    });

    it('should fail with short password', async () => {
      const res = await request(server)
        .post('/api/register')
        .send({
          name: 'Test User',
          email: 'test2@example.com',
          role: 'worker',
          password: 'short', // Too short
        });

      assert.equal(res.status, 400);
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
      await request(server).post('/api/register').send({
        name: 'Test User',
        email: 'forgot@example.com',
        role: 'worker',
        password: 'password123',
      });

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

  describe('POST /api/verify', () => {
    it('should verify a 6-digit code', async () => {
      const res = await request(server)
        .post('/api/verify')
        .send({ code: '123456' });

      assert.equal(res.status, 200);
      assert.exists(res.body.success);
    });

    it('should fail with invalid code length', async () => {
      const res = await request(server)
        .post('/api/verify')
        .send({ code: '123' });

      assert.equal(res.status, 400);
    });
  });
});
