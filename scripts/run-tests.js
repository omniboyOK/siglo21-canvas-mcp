import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

function getTestFiles(dir) {
  let files = [];
  if (!fs.existsSync(dir)) return files;
  for (const item of fs.readdirSync(dir)) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      files = files.concat(getTestFiles(fullPath));
    } else if (item.endsWith(".test.js")) {
      files.push(fullPath);
    }
  }
  return files;
}

const testFiles = getTestFiles("dist");

const env = {
  ...process.env,
  S21_DB_PATH: ":memory:",
  NODE_ENV: "test",
};

const child = spawn(process.execPath, ["--test", ...testFiles], {
  stdio: "inherit",
  env,
});

child.on("exit", (code) => {
  process.exit(code ?? 0);
});

