// Shared settings. The workshop tools require their full configuration.
import "dotenv/config";

const missing = [];
const invalid = [];
const required = (key) => {
  const value = process.env[key]?.trim();
  if (!value) missing.push(key);
  return value;
};
const optional = (key) => process.env[key]?.trim() || "";
const positiveNumber = (key) => {
  const value = Number(required(key));
  if (process.env[key] && !(value > 0)) invalid.push(`${key} (must be a positive number)`);
  return value;
};

const selected = optional("FACILITATOR");
const active = ["primary", "backup"].includes(selected) ? selected : undefined;
const F = active?.toUpperCase();

const planner = required("AGENT_PLANNER");
if (planner && !["ai", "scripted"].includes(planner)) invalid.push('AGENT_PLANNER (must be "ai" or "scripted")');

export const config = Object.freeze({
  network: required("STELLAR_NETWORK"),
  networkPassphrase: required("STELLAR_NETWORK_PASSPHRASE"),
  horizonUrl: required("STELLAR_HORIZON_URL"),
  rpcUrl: required("STELLAR_RPC_URL"),
  explorerUrl: required("STELLAR_EXPLORER_URL"),
  usdc: Object.freeze({
    code: required("USDC_ASSET_CODE"),
    issuer: required("USDC_ISSUER"),
    contractId: required("USDC_CONTRACT_ID"),
    decimals: Number(required("USDC_DECIMALS")),
    faucetUrl: required("USDC_FAUCET_URL"),
  }),
  // Each facilitator has its own URL + key, so a key is only ever sent to its own facilitator.
  facilitator: Object.freeze({
    name: active,
    url: F ? optional(`FACILITATOR_${F}_URL`).replace(/\/+$/, "") : "",
    apiKey: F ? optional(`FACILITATOR_${F}_API_KEY`) : "",
    keyUrl: F ? optional(`FACILITATOR_${F}_KEY_URL`) : "",
  }),
  // Wallets are checked by the scripts that need them, with friendlier messages.
  recipient: optional("STELLAR_RECIPIENT"),
  agentSecret: optional("STELLAR_SECRET_KEY"),
  port: Number(optional("PORT") || 4021),
  apiBaseUrl: required("API_BASE_URL")?.replace(/\/+$/, ""),
  consolePort: Number(required("CONSOLE_PORT")),
  agent: Object.freeze({
    taskBudgetUsd: positiveNumber("AGENT_TASK_BUDGET_USD"),
    maxPerRequestUsd: positiveNumber("AGENT_MAX_PER_REQUEST_USD"),
    allowedHosts: (required("AGENT_ALLOWED_HOSTS") || "").split(",").map((h) => h.trim()).filter(Boolean),
    approveAboveUsd: positiveNumber("AGENT_APPROVE_ABOVE_USD"),
    approvalTimeoutSeconds: positiveNumber("AGENT_APPROVAL_TIMEOUT_SECONDS"),
    dailyBudgetUsd: positiveNumber("AGENT_DAILY_BUDGET_USD"),
    spendLogFile: required("AGENT_SPEND_LOG_FILE"),
  }),
  ai: Object.freeze({
    planner,
    maxSteps: positiveNumber("AGENT_MAX_STEPS"),
    // Only required when the AI planner is on, so "scripted" still works without a key.
    apiKey: planner === "ai" ? required("OPENAI_API_KEY") : optional("OPENAI_API_KEY"),
    model: planner === "ai" ? required("OPENAI_MODEL") : optional("OPENAI_MODEL"),
  }),
});

export function requireWorkshopConfig() {
  if (missing.length) {
    console.error(`Missing in .env: ${missing.join(", ")}`);
    console.error("→ Run npm run setup to fill them in from .env.example.");
  }
  if (invalid.length) {
    console.error(`Invalid in .env: ${invalid.join(", ")}`);
    console.error("→ Fix these values in .env.");
  }
  if (missing.length || invalid.length) process.exit(1);
}

export const explorer = {
  account: (g) => `${config.explorerUrl}/account/${g}`,
  tx: (hash) => `${config.explorerUrl}/tx/${hash}`,
};
