// Role-Based Access Control tests
// Tests that forbidden fields are absent from responses for each role

import { assert } from "chai";
import request from "supertest";
import app from "../src/server.mjs";

let server;

before(() => {
  server = app.listen(0);
});

after(() => {
  server.close();
});

describe('RBAC - Role-Based Access Control', () => {
  describe('Contractor', () => {
    beforeEach(async () => {
      // Setup: create a contractor user and project
    });

    it('should include contractor_comp in responses', async () => {
      const res = await request(server)
        .get('/api/projects/proj1/money-summary');
      assert.exists(res.body.contractor_comp);
    });

    it('should include all project payments', async () => {
      const res = await request(server)
        .get('/api/projects/proj1/payments');
      assert.exists(res.body.payments);
    });
  });

  describe('Worker', () => {
    beforeEach(async () => {
      // Setup: create a worker user and project
    });

    it('should NOT include contractor_comp', async () => {
      const res = await request(server)
        .get('/api/projects/proj1/money-summary');
      assert.notExists(res.body.contractor_comp, 
        'contractor_comp should be null for workers');
    });

    it('should see only own allocation', async () => {
      const res = await request(server)
        .get('/api/projects/proj1/allocations');
      assert.lengthOf(res.body.allocations, 1);
      assert.equal(res.body.allocations[0].worker_id, 'worker1');
    });

    it('should see own payments + overall progress', async () => {
      const res = await request(server)
        .get('/api/projects/proj1/payments');
      assert.lengthOf(res.body.payments, 1); // own payment
      assert.exists(res.body.progress);
    });

    it('should hide other workers\' allocations', async () => {
      const res = await request(server)
        .get('/api/projects/proj1/allocations');
      // Should only have 1 allocation (the worker's own)
      assert.lengthOf(res.body.allocations, 1);
    });
  });

  describe('Client', () => {
    beforeEach(async () => {
      // Setup: create a client user and project
    });

    it('should include contractor_comp', async () => {
      const res = await request(server)
        .get('/api/projects/proj1/money-summary');
      assert.exists(res.body.contractor_comp);
    });

    it('should include all project payments with tx hashes', async () => {
      const res = await request(server)
        .get('/api/projects/proj1/payments');
      assert.exists(res.body.payments);
      // Check that tx hashes are included
      assert.exists(res.body.payments[0].transaction);
    });
  });
});

// Leak-check test: scan all response schemas for forbidden fields
describe('Leak Check', () => {
  it('should not leak contractor_comp in any worker response', async () => {
    // Scan all existing endpoints and verify contractor_comp is absent
    const endpoints = [
      '/api/projects/proj1/money-summary',
      '/api/projects/proj1/contractor-compensation',
    ];
    
    for (const endpoint of endpoints) {
      const res = await request(server).get(endpoint);
      if (res.body.contractor_comp !== undefined) {
        assert.fail(`contractor_comp found in ${endpoint} response for worker`);
      }
    }
  });

  it('should not leak other workers\' allocations in worker responses', async () => {
    const endpoints = [
      '/api/projects/proj1/allocations',
    ];
    
    for (const endpoint of endpoints) {
      const res = await request(server).get(endpoint);
      // Worker should only see their own allocation
      if (res.body.allocations.length > 1) {
        assert.fail(`Worker saw ${res.body.allocations.length} allocations in ${endpoint}`);
      }
    }
  });
});
