/**
 * Proxy retrocompatible para el servidor unificado del Portal Siglo 21 y Simulador.
 * La lógica se encuentra modularizada bajo la arquitectura Feature-Views en:
 * - src/server/portalServer.ts (Servidor HTTP)
 * - src/server/apiRouter.ts (REST API)
 * - src/features/simulator/ (Simulador de Exámenes)
 * - src/features/home/ (Inicio)
 * - src/features/mcp-tools/ (Herramientas Canvas)
 */

export {
  startExamSimulatorServer,
  type PortalServerResult,
  type StartSimulatorOptions
} from "./server/portalServer.js";
