import { createWriteStream } from "node:fs";
import { createReadStream } from "node:fs";
import { promisify } from "node:util";
import path from "node:path";

const readFile = promisify(createReadStream);
const writeFile = promisify(createWriteStream);

export { readFile, writeFile };

export const fileExists = (filePath) => {
  try {
    fs.accessSync(filePath);
    return true;
  } catch {
    return false;
  }
};

export const deleteFile = (filePath) => {
  try {
    fs.unlinkSync(filePath);
    return true;
  } catch (error) {
    return false;
  }
};

export const renameFile = (oldPath, newPath) => {
  try {
    fs.renameSync(oldPath, newPath);
    return true;
  } catch (error) {
    return false;
  }
};

export const getTempFilePath = (originalPath) => {
  const dir = path.dirname(originalPath);
  const base = path.basename(originalPath, path.extname(originalPath));
  const ext = path.extname(originalPath);
  return path.join(dir, `.tmp_${base}_${Date.now()}${ext}`);
};
