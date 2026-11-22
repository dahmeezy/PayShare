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
app.use("/api", moneyRouter);
app.use(moneyErrors);

app.listen(config.port, "127.0.0.1", () => {
  console.log(`PayShare testnet app at http://127.0.0.1:${config.port}`);
});
