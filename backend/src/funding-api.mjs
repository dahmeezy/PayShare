import { randomUUID } from "node:crypto";
import { fundingWallet, validateFundingRequest, verifyFundingTransfer } from "./funding.mjs";
import { requireRole } from "./project-auth.mjs";
import { projectError, readProjectState, updateProjectState } from "./project-store.mjs";

export function addFundingRoutes(router, endpoint) {
  router.post("/funding", endpoint(async (req, res) => {
    requireRole(req, "client");
    const request = validateFundingRequest(req.body);
    if (request.funding_address !== process.env.PAYSHARE_CLIENT_WALLET) {
      throw projectError("Use the configured client testnet wallet", 403);
    }
    const recipient = fundingWallet();
    if (recipient === request.funding_address) throw projectError("Use separate client and payout wallets", 503);
    const entry = await updateProjectState((state) => {
      const existing = state.funding.find((record) => record.status === "pending" &&
        record.amount === request.amount && record.funding_address === request.funding_address &&
        record.recipient === recipient);
      if (existing) return existing;
      const created = { id: randomUUID(), ...request, recipient, status: "pending", created_at: new Date().toISOString() };
      state.funding.push(created);
      return created;
    });
    res.status(201).json(entry);
  }));

  router.post("/funding/:fundingId/verify", endpoint(async (req, res) => {
    requireRole(req, "client");
    const state = await readProjectState();
    const request = state.funding.find(({ id }) => id === req.params.fundingId);
    if (!request) throw projectError("Funding request not found", 404);
    const hash = req.body?.transaction;
    if (request.status === "confirmed" && request.transaction === hash?.toLowerCase?.()) return res.json(request);
    if (request.status !== "pending") throw projectError("Funding request already confirmed", 409);
    if (request.recipient !== fundingWallet()) throw projectError("The funding wallet has changed", 409);
    const receipt = await verifyFundingTransfer(hash, request, request.recipient);
    const record = await updateProjectState((current) => {
      const match = current.funding.find(({ id }) => id === request.id);
      if (match.status === "confirmed" && match.transaction === receipt.transaction) return match;
      if (match.status !== "pending" || current.funding.some((entry) => entry.transaction === receipt.transaction)) {
        throw projectError("This transfer or funding request has already been used", 409);
      }
      return Object.assign(match, receipt, { status: "confirmed" });
    });
    res.json(record);
  }));

  router.get("/projects/:id/funding", endpoint(async (req, res) => {
    const { funding } = await readProjectState();
    res.json(funding.map((entry) => req.auth.role === "worker"
      ? { amount: entry.amount, status: entry.status } : entry));
  }));
}
