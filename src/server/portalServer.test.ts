import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ISOLATED_ENV_KEYS = [
  "CANVAS_TOKEN",
  "CANVAS_SESSION",
  "CANVAS_COOKIE",
  "CANVAS_CSRF_TOKEN",
  "CANVAS_URL",
  "S21_DB_PATH",
  "S21_COURSES_DIR",
  "S21_DISABLE_CONFIG_FALLBACK",
  "NODE_ENV",
] as const;

describe("Portal Server HTTP Security & CORS", () => {
  const savedEnv = new Map<string, string | undefined>();
  let tempCoursesDir: string;
  let portalUrl: string;
  let portalPort: number;
  let portalServer: import("node:http").Server;
  let isAllowedPortalOrigin: typeof import("./portalServer.js").isAllowedPortalOrigin;

  before(async () => {
    for (const key of ISOLATED_ENV_KEYS) {
      savedEnv.set(key, process.env[key]);
    }
    for (const key of [
      "CANVAS_TOKEN",
      "CANVAS_SESSION",
      "CANVAS_COOKIE",
      "CANVAS_CSRF_TOKEN",
      "CANVAS_URL",
    ]) {
      delete process.env[key];
    }

    tempCoursesDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "s21-portal-test-courses-")
    );
    process.env.S21_DB_PATH = ":memory:";
    process.env.S21_COURSES_DIR = tempCoursesDir;
    process.env.S21_DISABLE_CONFIG_FALLBACK = "1";
    process.env.NODE_ENV = "test";

    const portalMod = await import("./portalServer.js");
    isAllowedPortalOrigin = portalMod.isAllowedPortalOrigin;
    const started = await portalMod.startExamSimulatorServer(0, false);
    portalUrl = `http://127.0.0.1:${started.port}`;
    portalPort = started.port;
    portalServer = started.server;
  });

  after(async () => {
    if (portalServer) {
      portalServer.closeAllConnections?.();
      await new Promise<void>((resolve) => portalServer.close(() => resolve()));
    }
    for (const key of ISOLATED_ENV_KEYS) {
      const value = savedEnv.get(key);
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    if (tempCoursesDir && fs.existsSync(tempCoursesDir)) {
      fs.rmSync(tempCoursesDir, { recursive: true, force: true });
    }
  });

  it("isAllowedPortalOrigin debe permitir orígenes locales explícitos y rechazar null/file://", () => {
    assert.strictEqual(isAllowedPortalOrigin("http://localhost:42122"), true);
    assert.strictEqual(isAllowedPortalOrigin("http://127.0.0.1:42122"), true);
    assert.strictEqual(isAllowedPortalOrigin("http://[::1]:42122"), true);
    assert.strictEqual(isAllowedPortalOrigin("https://localhost:42122"), true);
    assert.strictEqual(isAllowedPortalOrigin("vscode-webview://demo"), true);
    assert.strictEqual(isAllowedPortalOrigin("app://siglo21"), true);

    assert.strictEqual(isAllowedPortalOrigin("null"), false);
    assert.strictEqual(isAllowedPortalOrigin(""), false);
    assert.strictEqual(isAllowedPortalOrigin("file:///tmp/index.html"), false);
    assert.strictEqual(isAllowedPortalOrigin("http://0.0.0.0:42122"), false);
    assert.strictEqual(isAllowedPortalOrigin("https://evil.com"), false);
    assert.strictEqual(isAllowedPortalOrigin("http://localhost.evil.com"), false);
    assert.strictEqual(isAllowedPortalOrigin("javascript:alert(1)"), false);
  });

  it("debe enlazar en 127.0.0.1, bloquear Origin null/externo y responder cabeceras de seguridad", async () => {
    const addr = portalServer.address() as { address: string; port: number };
    assert.strictEqual(addr.address, "127.0.0.1");

    const nullOriginRes = await fetch(`${portalUrl}/api/tools`, {
      headers: { Origin: "null" },
    });
    assert.strictEqual(nullOriginRes.status, 403);
    assert.strictEqual(
      nullOriginRes.headers.get("x-content-type-options"),
      "nosniff"
    );

    const evilOriginRes = await fetch(`${portalUrl}/api/tools`, {
      headers: { Origin: "https://evil.com" },
    });
    assert.strictEqual(evilOriginRes.status, 403);

    const allowedOrigin = `http://localhost:${portalPort}`;
    const okRes = await fetch(`${portalUrl}/api/tools`, {
      headers: { Origin: allowedOrigin },
    });
    assert.strictEqual(okRes.status, 200);
    assert.strictEqual(
      okRes.headers.get("access-control-allow-origin"),
      allowedOrigin
    );
    assert.match(okRes.headers.get("vary") || "", /Origin/i);
    assert.strictEqual(okRes.headers.get("x-content-type-options"), "nosniff");
  });
});
