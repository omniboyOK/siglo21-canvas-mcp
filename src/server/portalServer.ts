/**
 * Servidor HTTP institucional de la Universidad Siglo 21.
 * Integra Router de Estáticos (SPA compilada en React) y Micro-Router REST API.
 */

import http from "node:http";
import fs from "node:fs";
import { URL } from "node:url";
import { handleStaticRequest, getPublicIndexPath } from "./staticRouter.js";
import { handleApiRequest } from "./apiRouter.js";
import { openAppWindow } from "./launcher.js";

export interface PortalServerResult {
  port: number;
  url: string;
  server: http.Server;
}

let activePortalServer: http.Server | null = null;

export async function startExamSimulatorServer(
  port = 42122,
  autoOpen = true,
  initialTab: "home" | "simulator" | "mcp" = "home"
): Promise<PortalServerResult> {
  const targetUrl = initialTab !== "home" 
    ? `http://localhost:${port}/?tab=${initialTab}` 
    : `http://localhost:${port}`;

  // Si ya hay un servidor activo en este proceso, reutilizarlo
  if (activePortalServer && activePortalServer.listening) {
    if (autoOpen) {
      openAppWindow(targetUrl);
    }
    return { port, url: targetUrl, server: activePortalServer };
  }

  const server = http.createServer(async (req, res) => {
    try {
      // CORS restrictivo: solo permitir localhost y 127.0.0.1
      const origin = req.headers.origin;
      if (origin) {
        let isAllowed = false;
        try {
          const originUrl = new URL(origin);
          isAllowed = originUrl.hostname === "localhost" || originUrl.hostname === "127.0.0.1";
        } catch {
          isAllowed = false;
        }

        if (!isAllowed) {
          res.writeHead(403, { "Content-Type": "application/json; charset=utf-8" });
          res.end(JSON.stringify({ ok: false, error: "Origen no permitido" }));
          return;
        }

        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
      }

      if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
      }

      const host = req.headers.host || `localhost:${port}`;
      const reqUrl = new URL(req.url || "/", `http://${host}`);

      // 1. Archivos estáticos (/assets/*, /static/*, favicon, etc.)
      if (handleStaticRequest(req, res, reqUrl.pathname)) {
        return;
      }

      // 2. Micro-Router REST API (/api/*)
      if (await handleApiRequest(req, res, reqUrl)) {
        return;
      }

      // 3. Renderizado de la SPA de React (index.html)
      const publicIndexPath = getPublicIndexPath();
      if (publicIndexPath) {
        if (req.method === "GET") {
          res.writeHead(200, {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "no-cache"
          });
          fs.createReadStream(publicIndexPath).pipe(res);
          return;
        }
      } else {
        // En caso de que no se haya buildeado la SPA todavía
        res.writeHead(503, { "Content-Type": "text/html; charset=utf-8" });
        res.end(`
          <!DOCTYPE html>
          <html lang="es">
            <head><meta charset="utf-8"><title>Portal Siglo 21</title></head>
            <body style="font-family: system-ui; padding: 2rem; text-align: center; background: #f4f7f9;">
              <h2 style="color: #008D75;">Portal de Exámenes & MCP Siglo 21</h2>
              <p>El cliente web no ha sido compilado aún en <code>public/</code>.</p>
              <p>Por favor ejecuta en la carpeta <code>client</code>: <strong>npm run build</strong></p>
            </body>
          </html>
        `);
        return;
      }

      // 404 para cualquier otra ruta no GET
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Ruta no encontrada");
    } catch (err: any) {
      console.error("Error en Portal Server:", err);
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Error interno del servidor");
    }
  });


  return new Promise((resolve, reject) => {
    server.on("error", (err: any) => {
      if (err.code === "EADDRINUSE") {
        console.error(`[S21 Portal] El puerto ${port} está ocupado. Intentando en puerto alternativo ${port + 1}...`);
        startExamSimulatorServer(port + 1, autoOpen, initialTab).then(resolve).catch(reject);
      } else {
        reject(err);
      }
    });

    server.listen(port, () => {
      activePortalServer = server;
      console.error(`[S21 Portal] Servidor escuchando en ${targetUrl}`);

      if (autoOpen) {
        openAppWindow(targetUrl);
      }

      resolve({ port, url: targetUrl, server });
    });
  });
}
