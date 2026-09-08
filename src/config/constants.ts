/**
 * Constantes centralizadas del paquete s21-canvas-mcp.
 * La versión se lee de package.json para mantener un single source of truth.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadPackageVersion(): string {
  // Buscar package.json subiendo desde dist/config/ o src/config/
  let current = __dirname;
  for (let i = 0; i < 4; i++) {
    const pkgPath = path.join(current, "package.json");
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
      if (pkg.name === "s21-canvas-mcp" && pkg.version) {
        return pkg.version;
      }
    } catch {
      // Continuar buscando
    }
    current = path.dirname(current);
  }
  return "1.0.0";
}

/** Versión del paquete leída de package.json */
export const VERSION: string = loadPackageVersion();

/** User-Agent para peticiones HTTP a Canvas y SAM */
export const USER_AGENT: string = `S21-Canvas-MCP/${VERSION}`;

/** Puerto por defecto del portal HTTP local */
export const DEFAULT_PORTAL_PORT = 42122;

/** Nombre del servidor MCP */
export const SERVER_NAME = "s21-canvas-mcp";
