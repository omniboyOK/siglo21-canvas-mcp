import { spawn } from "node:child_process";

// Garantizar que la variable de base de datos en memoria exista en el proceso de prueba
const env = {
  ...process.env,
  S21_DB_PATH: ":memory:",
  NODE_ENV: "test",
};

const child = spawn(process.execPath, ["--test", "dist/**/*.test.js"], {
  stdio: "inherit",
  env,
});

child.on("exit", (code) => {
  process.exit(code ?? 0);
});
