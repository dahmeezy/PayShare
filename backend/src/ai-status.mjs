import OpenAI from "openai";
import { projectError } from "./project-store.mjs";
import { payoutTerms } from "./payout-agent.mjs";
import { funded, projectBudget } from "./workspace-store.mjs";

export function createAiStatus(settings) {
  if (settings.ai?.planner !== "ai" || !settings.ai.apiKey || !settings.ai.model) return null;
  const client = new OpenAI({ apiKey: settings.ai.apiKey, timeout: 10_000, maxRetries: 0 });
  return async project => {
    const taskCounts = {};
    for (const task of project.tasks) {
      let status = task.payout.status;
      if (status === "pending") {
        try { payoutTerms(project, task); status = "eligible"; }
        catch { status = "awaiting conditions"; }
      }
      taskCounts[status] = (taskCounts[status] || 0) + 1;
    }
    const snapshot = { mode: project.mode, fundedCents: funded(project), budgetCents: projectBudget(project), taskCounts };
    try {
      const response = await client.responses.create({
        model: settings.ai.model, store: false, max_output_tokens: 240,
        instructions: "Summarize these PayShare project totals in plain English. Amounts are USDC cents. Explicitly distinguish simulated and verified funds. Do not recommend or authorize a payment.",
        input: JSON.stringify(snapshot),
      });
      if (!response.output_text?.trim()) throw new Error("Empty summary");
      return response.output_text.trim();
    } catch { throw projectError("The AI summary is temporarily unavailable. Project actions still work.", 503); }
  };
}
