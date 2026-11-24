import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

export async function updateJsonFile(file, read, update, validate) {
  const lock = file + ".lock";
  try {
    await fs.mkdir(lock, { mode: 0o700 });
  } catch (error) {
    if (error.code === "EEXIST") throw Object.assign(new Error("Project is busy. Try again shortly."), { status: 409 });
    throw error;
  }
  const temporary = file + "." + randomUUID() + ".tmp";
  try {
    const state = await read();
    const result = await update(state);
    validate(state);
    const handle = await fs.open(temporary, "wx", 0o600);
    try {
      await handle.writeFile(JSON.stringify(state, null, 2) + "\n");
      await handle.sync();
    } finally {
      await handle.close();
    }
    await fs.rename(temporary, file);
    // Windows does not allow opening directories for fsync.
    if (process.platform !== "win32") {
      const directory = await fs.open(path.dirname(file), "r");
      try { await directory.sync(); } finally { await directory.close(); }
    }
    return result;
  } finally {
    await fs.rm(temporary, { force: true });
    await fs.rmdir(lock);
  }
}
