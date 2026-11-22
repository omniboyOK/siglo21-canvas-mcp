import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { resolveCanvasCredentials } from "./credentials.js";

function writeTempConfig(
  homeDir: string,
  subDir: string,
  content: string
): void {
  const dir = path.join(homeDir, ".gemini", subDir);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "mcp_config.json"), content, "utf-8");
}

describe("resolveCanvasCredentials", () => {
  it("debe leer credenciales desde env, normalizar CANVAS_URL y usar CANVAS_COOKIE como fallback de sesión", () => {
    const creds = resolveCanvasCredentials({
      env: {
        CANVAS_URL: "https://canvas.ejemplo.invalid///",
        CANVAS_TOKEN: "placeholder-bearer-val",
        CANVAS_COOKIE: "placeholder-cookie-val",
        CANVAS_CSRF_TOKEN: "placeholder-csrf-val",
      },
      disableConfigFileFallback: true,
    });

    assert.deepStrictEqual(creds, {
      url: "https://canvas.ejemplo.invalid",
      token: "placeholder-bearer-val",
      sessionCookie: "placeholder-cookie-val",
      csrfToken: "placeholder-csrf-val",
    });

    const sessionPriority = resolveCanvasCredentials({
      env: {
        CANVAS_SESSION: "placeholder-session-val",
        CANVAS_COOKIE: "placeholder-cookie-val",
      },
      disableConfigFileFallback: true,
    });
    assert.strictEqual(
      sessionPriority.sessionCookie,
      "placeholder-session-val"
    );
  });

  it("debe bloquear la lectura de mcp_config.json en NODE_ENV=test o con S21_DISABLE_CONFIG_FALLBACK=1", () => {
    const tempHome = fs.mkdtempSync(
      path.join(os.tmpdir(), "s21-creds-disabled-")
    );
    try {
      writeTempConfig(
        tempHome,
        "config",
        JSON.stringify({
          mcpServers: {
            "s21-canvas-mcp": {
              env: {
                CANVAS_TOKEN: "placeholder-should-not-load",
                CANVAS_URL: "https://should-not-load.invalid",
              },
            },
          },
        })
      );

      const envTest = resolveCanvasCredentials({
        env: { NODE_ENV: "test" },
      });
      assert.strictEqual(envTest.url, "https://siglo21.instructure.com");
      assert.strictEqual(envTest.token, "");
      assert.strictEqual(envTest.sessionCookie, "");

      const flagDisabled = resolveCanvasCredentials({
        env: { S21_DISABLE_CONFIG_FALLBACK: "1" },
        homeDir: tempHome,
      });
      assert.strictEqual(flagDisabled.url, "https://siglo21.instructure.com");
      assert.strictEqual(flagDisabled.token, "");

      const optionDisabled = resolveCanvasCredentials({
        env: {},
        homeDir: tempHome,
        disableConfigFileFallback: true,
      });
      assert.strictEqual(optionDisabled.token, "");
    } finally {
      fs.rmSync(tempHome, { recursive: true, force: true });
    }
  });

  it("debe leer fallback desde mcp_config.json temporal usando s21-canvas-mcp o siglo21", () => {
    const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "s21-creds-read-"));
    try {
      writeTempConfig(
        tempHome,
        "config",
        JSON.stringify({
          mcpServers: {
            "s21-canvas-mcp": {
              env: {
                CANVAS_TOKEN: "placeholder-config-val",
                CANVAS_URL: "https://config.ejemplo.invalid/",
              },
            },
          },
        })
      );

      const fromPrimary = resolveCanvasCredentials({
        env: {},
        homeDir: tempHome,
      });
      assert.deepStrictEqual(fromPrimary, {
        url: "https://config.ejemplo.invalid",
        token: "placeholder-config-val",
        sessionCookie: "",
        csrfToken: "",
      });

      fs.rmSync(path.join(tempHome, ".gemini", "config"), {
        recursive: true,
        force: true,
      });
      writeTempConfig(
        tempHome,
        "antigravity",
        JSON.stringify({
          mcpServers: {
            siglo21: {
              env: {
                CANVAS_COOKIE: "placeholder-antigravity-cookie",
                CANVAS_CSRF_TOKEN: "placeholder-antigravity-csrf",
              },
            },
          },
        })
      );

      const fromAlias = resolveCanvasCredentials({
        env: {},
        homeDir: tempHome,
      });
      assert.deepStrictEqual(fromAlias, {
        url: "https://siglo21.instructure.com",
        token: "",
        sessionCookie: "placeholder-antigravity-cookie",
        csrfToken: "placeholder-antigravity-csrf",
      });
    } finally {
      fs.rmSync(tempHome, { recursive: true, force: true });
    }
  });

  it("debe ignorar un mcp_config.json malformado y continuar con el siguiente archivo válido", () => {
    const tempHome = fs.mkdtempSync(
      path.join(os.tmpdir(), "s21-creds-corrupt-")
    );
    try {
      writeTempConfig(tempHome, "config", "{ invalid json");
      writeTempConfig(
        tempHome,
        "antigravity-ide",
        JSON.stringify({
          mcpServers: {
            "s21-canvas-mcp": {
              env: {
                CANVAS_SESSION: "placeholder-ide-session",
              },
            },
          },
        })
      );

      const creds = resolveCanvasCredentials({
        env: {},
        homeDir: tempHome,
      });
      assert.strictEqual(creds.sessionCookie, "placeholder-ide-session");
      assert.strictEqual(creds.url, "https://siglo21.instructure.com");
    } finally {
      fs.rmSync(tempHome, { recursive: true, force: true });
    }
  });
});
