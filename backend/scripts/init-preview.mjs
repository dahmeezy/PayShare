import { createProjectState } from "../src/project-store.mjs";

try {
  await createProjectState("preview");
  console.log("Preview project created. It cannot send blockchain payments.");
} catch (error) {
  console.error(error.code === "EEXIST" ? "Project history already exists. It was left intact." : error.message);
  process.exitCode = 1;
}
