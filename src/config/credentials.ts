/**
 * Resolución centralizada de credenciales Canvas LMS.
 *
 * Busca CANVAS_URL y CANVAS_TOKEN en:
 * 1. Variables de entorno
 * 2. Archivos mcp_config.json de Gemini/Antigravity (fallback)
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export interface CanvasCredentials {
  url: string;
  token?: string;
  sessionCookie?: string;
  csrfToken?: string;
}

export interface ResolveCanvasCredentialsOptions {
  env?: NodeJS.ProcessEnv;
  homeDir?: string;
  disableConfigFileFallback?: boolean;
}

export function resolveCanvasCredentials(
  options: ResolveCanvasCredentialsOptions = {}
): CanvasCredentials {
  const env = options.env ?? process.env;
  let url = (
    env.CANVAS_URL || "https://siglo21.instructure.com"
  ).replace(/\/+$/, "");
  let token = env.CANVAS_TOKEN || "";
  let sessionCookie =
    env.CANVAS_SESSION || env.CANVAS_COOKIE || "";
  let csrfToken = env.CANVAS_CSRF_TOKEN || "";

  const envDisablesFallback =
    env.S21_DISABLE_CONFIG_FALLBACK === "1" ||
    env.S21_DISABLE_CONFIG_FALLBACK === "true" ||
    (env.NODE_ENV === "test" && options.homeDir === undefined);
  const disableFallback =
    options.disableConfigFileFallback ?? envDisablesFallback;

  if (!token && !sessionCookie && !disableFallback) {
    const baseHome = options.homeDir ?? os.homedir();
    const candidatePaths = [
      path.join(baseHome, ".gemini", "config", "mcp_config.json"),
      path.join(baseHome, ".gemini", "antigravity", "mcp_config.json"),
      path.join(
        baseHome,
        ".gemini",
        "antigravity-ide",
        "mcp_config.json"
      ),
    ];

    for (const configPath of candidatePaths) {
      if (token || sessionCookie) break;
      try {
        if (fs.existsSync(configPath)) {
          const raw = fs.readFileSync(configPath, "utf-8");
          const parsed = JSON.parse(raw);
          const serverConfig =
            parsed?.mcpServers?.["s21-canvas-mcp"] ||
            parsed?.mcpServers?.["siglo21"];
          if (serverConfig?.env?.CANVAS_TOKEN) {
            token = serverConfig.env.CANVAS_TOKEN;
          }
          if (serverConfig?.env?.CANVAS_SESSION) {
            sessionCookie = serverConfig.env.CANVAS_SESSION;
          } else if (serverConfig?.env?.CANVAS_COOKIE) {
            sessionCookie = serverConfig.env.CANVAS_COOKIE;
          }
          if (serverConfig?.env?.CANVAS_CSRF_TOKEN) {
            csrfToken = serverConfig.env.CANVAS_CSRF_TOKEN;
          }
          if (serverConfig?.env?.CANVAS_URL) {
            url = serverConfig.env.CANVAS_URL.replace(/\/+$/, "");
          }
        }
      } catch {
        // Ignorar fallo de lectura de config
      }
    }
  }

  return { url, token, sessionCookie, csrfToken };
}
