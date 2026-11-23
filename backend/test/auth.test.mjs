// Auth endpoint tests
import { assert } from "chai";
import request from "supertest";
import app from "../src/server.mjs";

// Wait for server to be ready
let server;

before(() => {
  server = app.listen(0);
});

after(() => {
  server.close();
});

beforeEach(() => {
  // Clear users before each test
  // In a real test, we'd use a test database
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
      await request(server).post('/api/register').send({
        name: 'Test User',
        email: 'test@example.com',
        role: 'worker',
        password: 'password123',
      });
      
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
      await request(server).post('/api/register').send({
        name: 'Test User',
        email: 'test@example.com',
        role: 'worker',
        password: 'password123',
      });
      
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
      await request(server).post('/api/register').send({
        name: 'Test User',
        email: 'test@example.com',
        role: 'worker',
        password: 'password123',
      });
      
      // Try 6 failed logins (limit is 5)
      for (let i = 0; i < 6; i++) {
        await request(server)
          .post('/api/login')
          .send({
            email: 'test@example.com',
            password: 'wrongpassword',
          });
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
      assert.notInclude(res.body, 'user');
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
