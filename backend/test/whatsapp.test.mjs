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

test("share links carry status text and an HTTPS sign-in link, with no payment action", async () => {
  const { createWhatsAppLink } = await import("../src/whatsapp.mjs");
  const draft = { status: "draft", sent: false, message: "Payment update", message_type: "payment_update" };
  const result = createWhatsAppLink(draft, "2348012345678", "https://payshare.example");
  assert.equal(result.sent, false);
  assert.equal(result.landing_url, "https://payshare.example/money?section=payments");
  assert.equal(new URL(result.share_url).host, "wa.me");
  assert.match(new URL(result.share_url).searchParams.get("text"), /PayShare to review/);
  assert.throws(() => createWhatsAppLink(draft, "1234", "https://payshare.example"));
  assert.throws(() => createWhatsAppLink(draft, "2348012345678", "http://payshare.example"));
});
