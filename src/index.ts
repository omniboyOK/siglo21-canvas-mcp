#!/usr/bin/env node

// En MCP sobre stdio, stdout es exclusivo de JSON-RPC. Redirigimos console.log a stderr
// para que advertencias de librerías externas (ej: pdf-parse / pdf.js) no corrompan el canal.
console.log = console.error;

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpServer } from "./tools/registry.js";

async function main() {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("🎓 [S21-Canvas-MCP] Servidor iniciado correctamente en canal stdio.");
}

main().catch((error) => {
  console.error("❌ Error fatal al iniciar el servidor MCP:", error);
  process.exit(1);
});
