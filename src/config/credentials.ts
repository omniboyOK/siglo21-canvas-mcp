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
  token: string;
}

export function resolveCanvasCredentials(): CanvasCredentials {
  let url = (
    process.env.CANVAS_URL || "https://siglo21.instructure.com"
  ).replace(/\/+$/, "");
  let token = process.env.CANVAS_TOKEN || "";

  if (!token) {
    const candidatePaths = [
      path.join(os.homedir(), ".gemini", "config", "mcp_config.json"),
      path.join(os.homedir(), ".gemini", "antigravity", "mcp_config.json"),
      path.join(
        os.homedir(),
        ".gemini",
        "antigravity-ide",
        "mcp_config.json"
      ),
    ];

    for (const configPath of candidatePaths) {
      if (token) break;
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
          if (serverConfig?.env?.CANVAS_URL) {
            url = serverConfig.env.CANVAS_URL.replace(/\/+$/, "");
          }
        }
      } catch {
        // Ignorar fallo de lectura de config
      }
    }
  }

  return { url, token };
}
