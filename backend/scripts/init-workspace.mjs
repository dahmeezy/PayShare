import "dotenv/config";
import { initializeWorkspace } from "../src/workspace-store.mjs";

try {
  await initializeWorkspace();
  console.log("New PayShare workspace created.");
} catch (error) {
  if (error.code === "EEXIST") console.log("The workspace already exists. Its history was kept.");
  else throw error;
}
