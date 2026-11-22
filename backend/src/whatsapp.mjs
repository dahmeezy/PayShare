// WhatsApp notification drafts never authorize payouts or send messages.
// A real provider integration must be added separately.
export const MESSAGE_TYPES = ["payment_reminder", "payment_update", "task_update"];

export function validateWhatsAppDraft(body, workerIds) {
  if (!body || body.project_id !== "proj_demo") throw new Error("project_id is invalid");
  if (!MESSAGE_TYPES.includes(body.message_type)) throw new Error("message_type is invalid");
  if (typeof body.sent_to !== "string" || !workerIds.includes(body.sent_to)) {
    throw new Error("sent_to must be a project worker");
  }
  if (typeof body.message !== "string" || !body.message.trim() || body.message.length > 1000) {
    throw new Error("message must be 1 to 1000 characters");
  }
  return {
    project_id: body.project_id,
    message_type: body.message_type,
    sent_to: body.sent_to,
    message: body.message.trim(),
    status: "draft",
    sent: false,
  };
}
