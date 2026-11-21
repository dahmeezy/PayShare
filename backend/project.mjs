// The PayShare project data: one source of truth for the server AND the agent.
// (Sample data, scaled down 100x so testnet USDC lasts.)
import "dotenv/config";

export const PROJECT = {
  name: "Wedding decoration, Lekki",
  budget: 10,        // USDC the client funded
  expenses: 1,       // approved expenses
  contractorPay: 2,  // Tola's own compensation
  workers: [
    { id: "amara", wallet: process.env.WORKER_AMARA, name: "Amara", task: "Stage and balloon setup", allocation: 1.5 },
    { id: "bisi",  wallet: process.env.WORKER_BISI,  name: "Bisi",  task: "Floral arrangements",     allocation: 2.5 },
    { id: "chidi", wallet: process.env.WORKER_CHIDI, name: "Chidi", task: "Cleanup and teardown",    allocation: 3.0 },
  ],
};