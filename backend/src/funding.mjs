// Funding requests are NOT proof that money arrived on Stellar.
import fs from "node:fs/promises";
const FILE = "funding-requests.json";

export function validateFundingRequest(body) {
  if (!body || !Number.isSafeInteger(body.amount) || body.amount <= 0) {
    throw new Error("amount must be a positive integer in cents");
  }
  if (typeof body.funding_address !== "string" || !/^G[A-Z2-7]{55}$/.test(body.funding_address)) {
    throw new Error("funding_address must be a Stellar public account address");
  }
  return { amount: body.amount, funding_address: body.funding_address };
}

export async function readFundingRequests() {
  try {
    const requests = JSON.parse(await fs.readFile(FILE, "utf8"));
    if (!Array.isArray(requests)) throw new Error("Invalid funding request history");
    return requests;
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

export async function saveFundingRequest(request) {
  const requests = await readFundingRequests();
  requests.push({ ...request, status: "pending", created_at: new Date().toISOString() });
  await fs.writeFile(FILE, JSON.stringify(requests, null, 2));
  return requests[requests.length - 1];
}
