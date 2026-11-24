// PayShare project catalog and money API.
import express from "express";
import { config } from "./settings.mjs";
import { PROJECT } from "./project.mjs";
import { moneyRouter } from "./money-api.mjs";

const { usdc } = config;

// ── Rule: the budget breakdown must always balance ──
// Distributable = Budget - Expenses - Contractor pay. Counted in cents to avoid rounding errors.
const cents = (n) => Math.round(n * 100);
const distributable = cents(PROJECT.budget) - cents(PROJECT.expenses) - cents(PROJECT.contractorPay);
const allocated = PROJECT.workers.reduce((sum, w) => sum + cents(w.allocation), 0);
if (allocated !== distributable) {
    console.error(`✗ Budget doesn't balance: workers get ${allocated / 100} but ${distributable / 100} is distributable.`);
    process.exit(1);
}

const app = express();
// Delivery settlement is disabled on this entry point until the history-checked route is enabled.
app.use("/paid", (_req, res) => res.sendStatus(503));

// ── Free route: what's for sale ──
app.get("/catalog", (_req, res) => {
    res.json({
        project: PROJECT.name,
        asset: usdc.code || "USDC",
        routes: PROJECT.workers.map((w) => ({ path: `/paid/deliverable/${w.id}`, worker: w.name, priceUsd: w.allocation })),
    });
});

// ── Money API for the frontend (role-filtered) ──
app.use("/api", moneyRouter);

app.listen(config.port, () => {
    console.log(`\nPayShare API on http://localhost:${config.port}`);
    console.log(`Budget ${PROJECT.budget} - expenses ${PROJECT.expenses} - contractor ${PROJECT.contractorPay} = ${distributable / 100} distributable ✓ balanced`);
});
