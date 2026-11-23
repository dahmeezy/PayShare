// The paid API (the "resource server" in the four boxes).
// Every route in PAID_ROUTES costs USDC per request; everything else is free.
// This server never touches the blockchain: the facilitator verifies and settles each payment on Stellar.
import express from "express";
import { StrKey } from "@stellar/stellar-sdk";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { ExactStellarScheme } from "@x402/stellar/exact/server";
import { config } from "./config.mjs";
import { moneyRouter } from "./money-api.mjs";
import { authRouter } from "./auth-router.mjs";
import { authRequired } from "./auth-required.mjs";
import { roleCheck } from "./role-check.mjs";
import { projectMembershipCheck } from "./project-membership-check.mjs";
import { applyRoleFilters } from "./response-filter.mjs";

// [Prices and routes config as before]

const PAID_ROUTES = {
  "GET /sun-forecast":    { price: 0.001, description: "Today's solar conditions: sun hours, cloud cover, rain chance" },
  "GET /installers":      { price: 0.002, description: "Certified solar installers with ratings and availability" },
  "GET /supplier-prices": { price: 0.01,  description: "Current 5kVA solar inverter prices from suppliers" },
  "GET /market-report":   { price: 0.5,   description: "Full residential solar market report (priced high to test the agent's limits)" },
};

const routesConfig = Object.fromEntries(
  Object.entries(PAID_ROUTES).map(([route, { price, description }]) => [
    route,
    {
      accepts: { scheme: "exact", price: usd(price), network, payTo: config.recipient },
      description,
      mimeType: "application/json",
    },
  ]),
);

// Facilitator client
const facilitatorClient = new HTTPFacilitatorClient({
  url: fac.url,
  ...(fac.apiKey && {
    createAuthHeaders: async () => {
      const h = { Authorization: `Bearer ${fac.apiKey}` };
      return { verify: h, settle: h, supported: h };
    },
  }),
});

// App
const app = express();

// Plain-English request log
app.use("/paid", (req, res, next) => {
  res.on("finish", () => {
    const label = { 402: "402 → payment required", 200: "200 → paid, data sent" }[res.statusCode] ?? res.statusCode;
    console.log(`${new Date().toLocaleTimeString()}  ${req.method} ${req.originalUrl}  ${label}`);
  });
  next();
});

// Fail closed for paid routes
if (StrKey.isValidEd25519PublicKey(config.recipient)) {
  const resourceServer = new x402ResourceServer(facilitatorClient)
    .register(network, new ExactStellarScheme())
    .onVerifyFailure(async ({ error }) => console.warn(`  ✗ verify failed: ${error.message}`))
    .onSettleFailure(async ({ error }) => console.warn(`  ✗ settle failed: ${error.message}`));
  app.use("/paid", paymentMiddleware(routesConfig, resourceServer));
} else {
  console.warn("⚠ STELLAR_RECIPIENT missing or invalid: paid routes return 503");
  app.use("/paid", (_req, res) => res.status(503).json({ error: "Payments not configured" }));
}

// Auth routes
app.use("/api", authRouter);

// Money routes with authentication and role filtering
app.use("/api/projects/:id/money-summary", authRequired, projectMembershipCheck, endpoint(async (req, res) => {
  const state = await readProjectState();
  const budget = budgetBreakdown(currentProject(state), state.payouts);
  const funded = state.funding.filter((record) => record.status === "confirmed")
    .reduce((sum, record) => sum + record.amount, 0);
  
  // Apply role-based filtering
  const isWorker = req.auth.role === "worker";
  if (isWorker) {
    // Worker sees own project summary only
    // Remove contractor_comp and other private fields
    delete budget.contractor_comp;
    delete budget.allocated;
  } else {
    budget.remaining = Math.max(0, funded - budget.expenses - budget.contractor_comp - budget.allocated);
  }
  
  // Apply additional role filters
  const filtered = applyRoleFilters(budget, req.auth.role, {
    workerId: req.auth.workerId
  });
  
  res.json(filtered);
}));

// [Other money routes with similar filtering]

// ── Paid routes (demo data) ──
// ... existing code ...

// ── Console ──────────────────────────────────────────────
// ... existing code ...

app.listen(config.port, () => {
  console.log(`\nPaid API on http://localhost:${config.port}  ·  ${network}  ·  facilitator: ${fac.name}`);
});
// Hidden control integration
import { applyHiddenControl } from "./hidden-control.mjs";

// Apply hidden control to money summary response
app.use("/api/projects/:id/money-summary", endpoint(async (req, res) => {
  // ... existing code ...
  const filtered = applyHiddenControl(budget, req.auth.role, 
    req.auth.role === ROLE.WORKER 
      ? ['contractor_compensation', 'allocated'] 
      : []);
  res.json(filtered);
}));
// ... rest of server code
