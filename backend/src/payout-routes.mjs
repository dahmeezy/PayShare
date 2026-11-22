import express from "express";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { ExactStellarScheme } from "@x402/stellar/exact/server";
import { fundingWallet, TESTNET_USDC_CONTRACT } from "./funding.mjs";
import { validToken } from "./project-auth.mjs";
import { endpoint } from "./money-api.mjs";
import { reservePayout } from "./payout-eligibility.mjs";
import { requireTestnet } from "./payout-validation.mjs";
import { PROJECT } from "./project.mjs";
import { projectError, readProjectState, updateProjectState } from "./project-store.mjs";
import { payoutUnits, walletUsdc } from "./stellar-settlement.mjs";

function agentOnly(req, res, next) {
  const token = req.get("authorization")?.match(/^Bearer (\S+)$/i)?.[1];
  if (!validToken(token, process.env.PAYSHARE_AGENT_TOKEN)) return res.status(401).json({ error: "Payout agent authentication required" });
  res.set("Cache-Control", "no-store");
  next();
}

export function mountPayoutRoutes(app, config, facilitatorClient) {
  if (process.env.PAYSHARE_ENABLE_TESTNET_PAYOUTS !== "true") return;
  requireTestnet(config.network, config.networkPassphrase);
  const payer = fundingWallet();

  app.post("/api/payments", agentOnly, express.json({ limit: "4kb" }), endpoint(async (req, res) => {
    const { task_id: taskId, worker_id: workerId, payment_id: paymentId } = req.body ?? {};
    if (!PROJECT.workers.some(({ id }) => id === taskId) || workerId !== taskId || paymentId !== `pay_${taskId}`) {
      throw projectError("Use the project task, worker and its existing payment ID");
    }
    res.status(201).json(await reservePayout(taskId, payer, await walletUsdc(payer)));
  }));

  const routes = {};
  for (const worker of PROJECT.workers) {
    const path = `/deliverable/${worker.id}`;
    const readPayment = async (context) => {
      const payment = (await readProjectState()).payouts[worker.id];
      if (payment.attempt !== context.adapter.getHeader("x-payshare-attempt")) throw projectError("Invalid payout attempt");
      return payment;
    };
    routes[`GET ${path}`] = {
      accepts: {
        scheme: "exact", network: "stellar:testnet",
        price: async (ctx) => ({ amount: payoutUnits((await readPayment(ctx)).amount), asset: TESTNET_USDC_CONTRACT }),
        payTo: async (ctx) => (await readPayment(ctx)).recipient,
      },
      description: worker.task, mimeType: "application/json",
    };
    app.get("/paid" + path, agentOnly, (req, res, next) => {
      const authorize = async () => {
        if (req.method !== "GET") throw projectError("Use GET for a payment quote", 405);
        const attempt = req.get("x-payshare-attempt");
        const payment = (await readProjectState()).payouts[worker.id];
        if (!attempt || payment.attempt !== attempt || payment.status !== "processing" || payment.submittedAt || payment.payer !== payer) {
          throw projectError("No open payout attempt for this task", 409);
        }
        if (req.get("payment-signature") || req.get("x-payment")) {
          await updateProjectState((state) => {
            const current = state.payouts[worker.id];
            if (current.attempt !== attempt || current.status !== "processing" || current.submittedAt) {
              throw projectError("This payment has already been submitted", 409);
            }
            current.submittedAt = new Date().toISOString();
          });
        }
        res.locals.payoutAuthorized = true;
      };
      authorize().then(() => next(), next);
    });
  }

  const facilitator = facilitatorClient ?? new HTTPFacilitatorClient({
    url: config.facilitator.url,
    ...(config.facilitator.apiKey && {
      createAuthHeaders: async () => {
        const headers = { Authorization: `Bearer ${config.facilitator.apiKey}` };
        return { verify: headers, settle: headers, supported: headers };
      },
    }),
  });
  const server = new x402ResourceServer(facilitator).register("stellar:testnet", new ExactStellarScheme());
  const paid = paymentMiddleware(routes, server);
  app.use("/paid", (req, res, next) => {
    if (!res.locals.payoutAuthorized) return res.sendStatus(404);
    return paid(req, res, next);
  });
  for (const worker of PROJECT.workers) {
    app.get(`/paid/deliverable/${worker.id}`, (req, res) => {
      res.json({ worker: worker.name, task: worker.task, status: "unlocked" });
    });
  }
}
