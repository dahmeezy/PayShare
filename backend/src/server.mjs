// The paid API (the "resource server" in the four boxes).
// Every route in PAID_ROUTES costs USDC per request; everything else is free.
// This server never touches the blockchain: the facilitator verifies and settles each payment on Stellar.
import express from "express";
import { fileURLToPath, pathToFileURL } from "node:url";
import { StrKey } from "@stellar/stellar-sdk";
import { paymentMiddlewareFromHTTPServer, x402HTTPResourceServer, x402ResourceServer } from "@x402/express";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { ExactStellarScheme } from "@x402/stellar/exact/server";
import { config } from "./settings.mjs";
import { moneyRouter } from "./money-api.mjs";
import { createAuthRouter } from "./auth-router.mjs";
import { createWorkspaceRouter } from "./workspace-api.mjs";
import { createSettlement } from "./workspace-settlement.mjs";
import { createAiStatus } from "./ai-status.mjs";
import { createMailer } from "./email.mjs";

const PAID_ROUTES = {
  "GET /sun-forecast":    { price: 0.001, description: "Today's solar conditions: sun hours, cloud cover, rain chance" },
  "GET /installers":      { price: 0.002, description: "Certified solar installers with ratings and availability" },
  "GET /supplier-prices": { price: 0.01,  description: "Current 5kVA solar inverter prices from suppliers" },
  "GET /market-report":   { price: 0.5,   description: "Full residential solar market report (priced high to test the agent's limits)" },
};

function paidRequests({ usdc, network, facilitator, recipient }) {
  const unavailable = (_req, res) => res.status(503).json({ error: "Payments are temporarily unavailable." });
  const url = URL.canParse(facilitator.url) ? new URL(facilitator.url) : null;
  if (network !== "stellar:testnet" || !StrKey.isValidContract(usdc.contractId || "") ||
      usdc.decimals !== 7 || !StrKey.isValidEd25519PublicKey(recipient) ||
      !url || !["https:", "http:"].includes(url.protocol) ||
      (facilitator.keyUrl && !facilitator.apiKey)) {
    return unavailable;
  }

  const routes = Object.fromEntries(
    Object.entries(PAID_ROUTES).map(([route, { price, description }]) => [route, {
      accepts: {
        scheme: "exact",
        price: { amount: String(Math.round(price * 10 ** usdc.decimals)), asset: usdc.contractId },
        network, payTo: recipient,
      },
      description,
      mimeType: "application/json",
    }]),
  );
  const client = new HTTPFacilitatorClient({
    url: facilitator.url,
    ...(facilitator.apiKey && {
      createAuthHeaders: async () => {
        const headers = { Authorization: `Bearer ${facilitator.apiKey}` };
        return { verify: headers, settle: headers, supported: headers };
      },
    }),
  });
  const resource = new x402ResourceServer(client)
    .register(network, new ExactStellarScheme())
    .onVerifyFailure(async ({ error }) => console.warn(`Payment verification failed: ${error.message}`))
    .onSettleFailure(async ({ error }) => console.warn(`Payment settlement failed: ${error.message}`));
  const httpServer = new x402HTTPResourceServer(resource, routes);
  const middleware = paymentMiddlewareFromHTTPServer(httpServer, undefined, undefined, false);
  let initialization;

  return async (req, res, next) => {
    // Never serve a paid handler when the x402 route does not match.
    if (!httpServer.requiresPayment({ path: req.path, method: req.method })) return res.sendStatus(404);
    try {
      // Share discovery across concurrent requests and retry on a later paid request after failure.
      initialization ??= httpServer.initialize();
      await initialization;
    } catch {
      initialization = undefined;
      return unavailable(req, res);
    }
    Promise.resolve(middleware(req, res, next)).catch(next);
  };
}

export function createApp(settings = config, payment = {}, mailer = createMailer()) {
  const { usdc, network } = settings;
  const app = express();

  app.use("/paid", (req, res, next) => {
    res.on("finish", () => {
      const label = { 402: "402 → payment required", 200: "200 → paid, data sent" }[res.statusCode] ?? res.statusCode;
      console.log(`${new Date().toLocaleTimeString()}  ${req.method} ${req.originalUrl}  ${label}`);
    });
    next();
  });
  app.use("/paid", paidRequests(settings));

  // ── Paid routes (demo data: fixed sample values, marked demo: true) ──
  const where = (req) => String(req.query.location || "your area").slice(0, 80);

  app.get("/paid/sun-forecast", (req, res) => {
    res.json({ location: where(req), sunHours: 6.5, cloudCover: "25%", rainChance: "10%",
               verdict: "Good conditions for solar output and rooftop installation", demo: true });
  });

  app.get("/paid/installers", (req, res) => {
    res.json({
      location: where(req),
      installers: [
        { name: "Apex Solar Installs",  rating: 4.8, nextAvailable: "in 2 days", priceFromUsd: 250 },
        { name: "GreenRoof Energy",     rating: 4.5, nextAvailable: "tomorrow",  priceFromUsd: 220 },
        { name: "PowerUp Technicians",  rating: 4.2, nextAvailable: "in 5 days", priceFromUsd: 180 },
      ],
      demo: true,
    });
  });

  app.get("/paid/supplier-prices", (_req, res) => {
    res.json({
      product: "5kVA hybrid solar inverter",
      currency: "USD",
      suppliers: [
        { name: "SunVolt Supply", price: 780, inStock: true },
        { name: "BrightGrid",     price: 705, inStock: true },
        { name: "Helios Depot",   price: 745, inStock: false },
      ],
      demo: true,
    });
  });

  app.get("/paid/market-report", (_req, res) => {
    res.json({ title: "Residential Solar Market Report", pages: 42, summary: "…", demo: true });
  });

  // ── Free routes ────────────────────────────────────────────
  // What's on sale and for how much, so the agent and the console can show it.
  app.get("/catalog", (_req, res) => {
    res.json({
      network: network || "stellar:testnet",
      asset: usdc.code || "USDC",
      routes: Object.entries(PAID_ROUTES).map(([route, { price, description }]) => {
        const [method, path] = route.split(" ");
        return { method, path: `/paid${path}`, priceUsd: price, description };
      }),
    });
  });

  // A free step for the agent: finding suppliers costs nothing, detailed prices do.
  app.get("/search", (req, res) => {
    res.json({ query: req.query.q || "", results: ["SunVolt Supply", "BrightGrid", "Helios Depot"], demo: true });
  });

  // Health check for the hosting platform: the process is up and serving requests.
  app.get("/healthz", (_req, res) => {
    res.set("Cache-Control", "no-store").json({ status: "ok", uptimeSeconds: Math.round(process.uptime()) });
  });

  // ── Auth routes ────────────────────────────────────────────
  app.disable("x-powered-by");
  app.get("/", (_req, res) => res.redirect("/frontend/prototype.html?app=1"));
  app.use("/frontend", express.static(fileURLToPath(new URL("../../frontend", import.meta.url)), { index: false }));
  app.use("/api", (req, res, next) => {
    // Browsers include Origin on cross-site writes. The session cookie is also SameSite=Strict.
    const origin = req.get("origin");
    if (origin && !["GET", "HEAD", "OPTIONS"].includes(req.method) && (!URL.canParse(origin) || new URL(origin).host !== req.get("host"))) {
      return res.status(403).json({ error: "This request must come from PayShare" });
    }
    next();
  });
  app.use("/api/workspace", createWorkspaceRouter(payment.settlement || createSettlement(settings), payment.verifyFunding, createAiStatus(settings)));
  app.use("/api", createAuthRouter(mailer));

  app.use("/api", moneyRouter);

  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const status = error.status || (error.message === "Invalid credentials" ? 401 : 400);
    res.status(status).json({ error: status >= 500 && !error.expose ? "Internal server error" : error.message });
  });
  return app;
}

const app = createApp();
export default app;

export function startServer(port = config.port) {
  const server = app.listen(port, () => {
    console.log(`PayShare API on http://localhost:${server.address().port}`);
  });
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startServer();
}
