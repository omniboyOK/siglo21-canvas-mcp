import { startExamSimulatorServer } from "./examSimulatorServer.js";

/**
 * Abre el portal interactivo unificado de Siglo 21 directamente en la sección
 * de Documentación de Herramientas MCP y Generador de Prompts.
 */
export async function startInteractiveGuideServer(
  preferredPort: number = 42122,
  autoOpen: boolean = true
): Promise<{ url: string; port: number }> {
  return startExamSimulatorServer(preferredPort, autoOpen, "mcp");
}
