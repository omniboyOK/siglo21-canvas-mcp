import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
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
const tempCoursesDir = fs.mkdtempSync(path.join(os.tmpdir(), "s21-test-courses-"));

const env = { ...process.env };
for (const key of [
  "CANVAS_TOKEN",
  "CANVAS_SESSION",
  "CANVAS_COOKIE",
  "CANVAS_CSRF_TOKEN",
  "CANVAS_URL",
]) {
  delete env[key];
}

env.S21_DB_PATH = ":memory:";
env.S21_COURSES_DIR = tempCoursesDir;
env.S21_DISABLE_CONFIG_FALLBACK = "1";
env.NODE_ENV = "test";

let cleaned = false;
function cleanup() {
  if (cleaned) return;
  cleaned = true;
  try {
    fs.rmSync(tempCoursesDir, { recursive: true, force: true });
  } catch {
    // Ignorar error de limpieza temporal
  }
}

const child = spawn(process.execPath, ["--test", ...testFiles], {
  stdio: "inherit",
  env,
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    child.kill(signal);
  });
}

child.on("error", (err) => {
  cleanup();
  console.error(err);
  process.exit(1);
});

child.on("exit", (code) => {
  cleanup();
  process.exit(code ?? 0);
});
