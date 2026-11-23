import { fileURLToPath } from "node:url";
import express from "express";
import { config } from "./config.mjs";
import { moneyErrors, moneyRouter } from "./money-api.mjs";
import { requireTestnet } from "./payout-validation.mjs";
import { mountPayoutRoutes } from "./payout-routes.mjs";
import { readProjectState, currentProject } from "./project-store.mjs";

requireTestnet(config.network, config.networkPassphrase);
const host = process.env.PAYSHARE_HOST || "127.0.0.1";
if (host !== "127.0.0.1" && process.env.PAYSHARE_ENABLE_TESTNET_PAYOUTS === "true") {
  throw new Error("A hosted PayShare preview must have its payout routes disabled.");
}
const app = express();
app.disable("x-powered-by");
mountPayoutRoutes(app, config);
app.get("/catalog", async (req, res, next) => {
  try {
    const project = currentProject(await readProjectState());
    res.json({ project: project.name, asset: "USDC" });
  } catch (error) {
    next(error);
  }
});
app.get("/", (req, res) => res.redirect("/money"));
app.get("/healthz", async (req, res, next) => {
  try {
    await readProjectState();
    res.json({ status: "ok", network: "stellar:testnet" });
  } catch (error) {
    next(error);
  }
});

const moneyPage = fileURLToPath(new URL("../public/money", import.meta.url));
app.use("/money", (req, res, next) => {
  res.set("Content-Security-Policy", "default-src 'self'; frame-ancestors 'none'; base-uri 'none'");
  res.set("Referrer-Policy", "no-referrer");
  next();
});
app.get("/money", (req, res) => res.sendFile("index.html", { root: moneyPage }));
app.use("/money", express.static(moneyPage));
app.use("/api", moneyRouter);
app.use(moneyErrors);

app.listen(config.port, host, () => {
  console.log(`PayShare testnet app at http://127.0.0.1:${config.port}`);
});
