import type { ToolDefinition } from "../_base.js";
import { textResponse } from "../_base.js";
import { PortalSchema } from "../schemas.js";
import { startExamSimulatorServer } from "../../server/portalServer.js";

export const portalTool: ToolDefinition = {
  name: "s21_open_interactive_portal",
  description:
    "Abre el portal interactivo unificado de Universidad Siglo 21 (pantalla de inicio con bienvenida al alumno, métricas, accesos directos y catálogo de herramientas).",
  inputSchema: {
    type: "object",
    properties: {
      port: { type: "number", description: "Puerto HTTP opcional para el servidor local (por defecto 42122)." },
      auto_open: { type: "boolean", description: "Si es true (por defecto), abre automáticamente la ventana en modo aplicación." },
    },
  },
  requiresAuth: false,
  handler: async (args) => {
    const parsed = PortalSchema.parse(args);
    const port = parsed.port ?? 42122;
    const autoOpen = parsed.auto_open !== false;
    const result = await startExamSimulatorServer(port, autoOpen, "home");
    return textResponse(
      `🚀 Portal interactivo unificado disponible en ${result.url}\n\nSe ha abierto en ventana de escritorio independiente (App Mode) con la interfaz oficial de Universidad Siglo 21.\nPuedes consultar tu estado de cursada, rendir simulacros o explorar las herramientas MCP.`
    );
  },
};
