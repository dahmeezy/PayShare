import test from "node:test";
import assert from "node:assert/strict";
import { validateWhatsAppDraft } from "../src/whatsapp.mjs";

const valid = {
  project_id: "proj_demo",
  message_type: "payment_update",
  sent_to: "amara",
  message: "Your payment is pending.",
};

test("validates a draft without claiming to send it", () => {
  const draft = validateWhatsAppDraft(valid, ["amara"]);
  assert.equal(draft.status, "draft");
  assert.equal(draft.sent, false);
});

test("rejects unsupported types and recipients", () => {
  assert.throws(() => validateWhatsAppDraft({ ...valid, message_type: "pay_now" }, ["amara"]));
  assert.throws(() => validateWhatsAppDraft({ ...valid, sent_to: "unknown" }, ["amara"]));
});

test("rejects empty and oversized messages", () => {
  assert.throws(() => validateWhatsAppDraft({ ...valid, message: "  " }, ["amara"]));
  assert.throws(() => validateWhatsAppDraft({ ...valid, message: "x".repeat(1001) }, ["amara"]));
});
