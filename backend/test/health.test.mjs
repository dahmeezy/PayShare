import { test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../src/server.mjs";

test("health check answers without a session and is never cached", async () => {
  const response = await request(createApp()).get("/healthz").expect(200);
  assert.equal(response.body.status, "ok");
  assert.equal(response.headers["cache-control"], "no-store");
});
