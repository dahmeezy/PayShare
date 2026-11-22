import { fileURLToPath } from "node:url";
import express from "express";
import { config } from "./config.mjs";
import { moneyErrors, moneyRouter } from "./money-api.mjs";
import { mountPayoutRoutes } from "./payout-routes.mjs";
import { readProjectState, currentProject } from "./project-store.mjs";

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

app.listen(config.port, "127.0.0.1", () => {
  console.log(`PayShare testnet app at http://127.0.0.1:${config.port}`);
});
