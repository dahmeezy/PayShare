// PayShare paid API (v0).
// Each worker's deliverable is sold at that worker's agreed allocation, and the payment
// goes straight to that worker's OWN wallet. The facilitator verifies and settles it.
import express from "express";
import { StrKey } from "@stellar/stellar-sdk";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { ExactStellarScheme } from "@x402/stellar/exact/server";
import { config } from "./config.mjs";
import { PROJECT } from "./project.mjs";
import { moneyErrors, moneyRouter } from "./money-api.mjs";

const { network, usdc, facilitator: fac } = config;

// ── Rule: the budget breakdown must always balance ──
// Distributable = Budget - Expenses - Contractor pay. Counted in cents to avoid rounding errors.
const cents = (n) => Math.round(n * 100);
const distributable = cents(PROJECT.budget) - cents(PROJECT.expenses) - cents(PROJECT.contractorPay);
const allocated = PROJECT.workers.reduce((sum, w) => sum + cents(w.allocation), 0);
if (allocated !== distributable) {
    console.error(`✗ Budget doesn't balance: workers get ${allocated / 100} but ${distributable / 100} is distributable.`);
    process.exit(1);
}

// ── Every worker needs a valid wallet, or we refuse to start (paid routes never run unguarded) ──
for (const w of PROJECT.workers) {
    if (!StrKey.isValidEd25519PublicKey(w.wallet || "")) {
        console.error(`✗ No valid wallet for ${w.name}. Run: node scripts/workers.mjs`);
        process.exit(1);
    }
}

// usd(1.5) → { amount: "15000000", asset: "C..." }  (USDC has 7 decimals on Stellar)
const usd = (dollars) => ({
    amount: String(Math.round(dollars * 10 ** usdc.decimals)),
    asset: usdc.contractId,
});

// One paid route per worker: price = her allocation, payTo = HER wallet.
const routesConfig = Object.fromEntries(
    PROJECT.workers.map((w) => [
        `GET /deliverable/${w.id}`,
        {
            accepts: { scheme: "exact", price: usd(w.allocation), network, payTo: w.wallet },
            description: `${w.name}'s deliverable: ${w.task}`,
            mimeType: "application/json",
        },
    ]),
);

const facilitatorClient = new HTTPFacilitatorClient({
    url: fac.url,
    ...(fac.apiKey && {
        createAuthHeaders: async () => {
            const h = { Authorization: `Bearer ${fac.apiKey}` };
            return { verify: h, settle: h, supported: h };
        },
    }),
});

const app = express();

// Plain-English log: 402 = "asked to pay", 200 = "paid and unlocked"
app.use("/paid", (req, res, next) => {
    res.on("finish", () => {
        const label = { 402: "402 → payment required", 200: "200 → paid, deliverable unlocked" }[res.statusCode] ?? res.statusCode;
        console.log(`${new Date().toLocaleTimeString()}  ${req.method} ${req.originalUrl}  ${label}`);
    });
    next();
});

const resourceServer = new x402ResourceServer(facilitatorClient)
    .register(network, new ExactStellarScheme())
    .onVerifyFailure(async ({ error }) => console.warn(`  ✗ verify failed: ${error.message}`))
    .onSettleFailure(async ({ error }) => console.warn(`  ✗ settle failed: ${error.message}  (the payment may still land on-chain: check the explorer)`));
app.use("/paid", paymentMiddleware(routesConfig, resourceServer));

// ── Paid routes: this code only runs AFTER the payment is verified ──
for (const w of PROJECT.workers) {
    app.get(`/paid/deliverable/${w.id}`, (_req, res) => {
        res.json({ project: PROJECT.name, worker: w.name, task: w.task, status: "unlocked", file: `${w.id}-deliverable.pdf`, demo: true });
    });
}

// ── Free route: what's for sale ──
app.get("/catalog", (_req, res) => {
    res.json({
        project: PROJECT.name,
        asset: usdc.code,
        routes: PROJECT.workers.map((w) => ({ path: `/paid/deliverable/${w.id}`, worker: w.name, priceUsd: w.allocation })),
    });
});

// ── Money API for the frontend (role-filtered) ──
app.use("/api", moneyRouter, moneyErrors);

app.listen(config.port, () => {
    console.log(`\nPayShare API on http://localhost:${config.port}  ·  ${network}  ·  facilitator: ${fac.name}`);
    console.log(`Budget ${PROJECT.budget} - expenses ${PROJECT.expenses} - contractor ${PROJECT.contractorPay} = ${distributable / 100} distributable ✓ balanced`);
    console.log(`Try:  npm run peek /paid/deliverable/amara\n`);
});