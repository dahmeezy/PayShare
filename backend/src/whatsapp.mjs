export const MESSAGE_TYPES = ["payment_reminder", "payment_update", "task_update", "invitation", "deadline_reminder", "allocation_change"];

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


const sections = {
  invitation: "deliverables", deadline_reminder: "deliverables", task_update: "deliverables",
  allocation_change: "changes", payment_reminder: "payments", payment_update: "payments",
};

export function createWhatsAppLink(draft, phone, appOrigin) {
  if (!/^[1-9][0-9]{7,14}$/.test(phone ?? "")) throw new Error("No WhatsApp number configured for this worker");
  const origin = new URL(appOrigin);
  if (origin.protocol !== "https:" || origin.username || origin.password ||
      origin.pathname !== "/" || origin.search || origin.hash) {
    throw new Error("Set a secure HTTPS PayShare app origin");
  }
  const landing = new URL("/money", origin);
  landing.searchParams.set("section", sections[draft.message_type]);
  const chat = new URL(`https://wa.me/${phone}`);
  chat.searchParams.set("text", `${draft.message}\n\nOpen PayShare to review: ${landing.href}`);
  return { ...draft, share_url: chat.href, landing_url: landing.href };
}
