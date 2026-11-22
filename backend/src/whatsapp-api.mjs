import { requireRole } from "./project-auth.mjs";
import { PROJECT } from "./project.mjs";
import { projectError } from "./project-store.mjs";
import { createWhatsAppLink, validateWhatsAppDraft } from "./whatsapp.mjs";

export function addWhatsAppRoutes(router, endpoint) {
  router.post("/whatsapp", endpoint((req, res) => {
    requireRole(req, "contractor", "client");
    let draft;
    try { draft = validateWhatsAppDraft(req.body, PROJECT.workers.map(({ id }) => id)); }
    catch (error) { throw projectError(error.message); }
    try {
      const phone = process.env[`PAYSHARE_WHATSAPP_${draft.sent_to.toUpperCase()}`];
      res.status(201).json(createWhatsAppLink(draft, phone, process.env.PAYSHARE_APP_URL));
    } catch {
      throw projectError("Configure the HTTPS app origin and the worker's WhatsApp number", 422);
    }
  }));
}
