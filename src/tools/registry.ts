/**
 * Registry central de herramientas MCP.
 *
 * Importa todos los handlers individuales, los registra en el servidor MCP
 * y conecta con el CanvasClient compartido.
 *
 * Agregar una herramienta nueva = crear 1 archivo en handlers/ y añadirlo aquí.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { resolveCanvasCredentials } from "../config/credentials.js";
import { VERSION, SERVER_NAME } from "../config/constants.js";
import { CanvasClient } from "../canvas/client.js";
import type { ToolDefinition, ToolContext, ToolResponse } from "./_base.js";
import { errorResponse } from "./_base.js";

// --- Importar todos los handlers ---
import { profileTool } from "./handlers/profile.js";
import { listCoursesTool } from "./handlers/courses.js";
import { pendingTasksTool } from "./handlers/pending-tasks.js";
import { academicStatusTool } from "./handlers/academic-status.js";
import { assignmentsTool } from "./handlers/assignments.js";
import { modulesTool } from "./handlers/modules.js";
import { courseFilesTool } from "./handlers/course-files.js";
import { pdfReaderTool } from "./handlers/pdf-reader.js";
import { readingTool } from "./handlers/reading.js";
import { quizTool } from "./handlers/quiz.js";
import { discussionsTool } from "./handlers/discussions.js";
import { rubricAuditTool } from "./handlers/rubric-audit.js";
import { searchReadingsTool } from "./handlers/search-readings.js";
import { syllabusTool } from "./handlers/syllabus.js";
import { eventsTool } from "./handlers/events.js";
import { announcementsTool } from "./handlers/announcements.js";
import { portalTool } from "./handlers/portal.js";
import { examSimulatorTool } from "./handlers/exam-simulator.js";
import { saveQuestionsTool } from "./handlers/save-questions.js";
import { bankQuestionsTool } from "./handlers/bank-questions.js";
import { bankSummaryTool } from "./handlers/bank-summary.js";

/** Registro completo de herramientas — agregar nuevas aquí */
const ALL_TOOLS: ToolDefinition[] = [
  profileTool,
  listCoursesTool,
  pendingTasksTool,
  academicStatusTool,
  assignmentsTool,
  modulesTool,
  courseFilesTool,
  pdfReaderTool,
  readingTool,
  quizTool,
  discussionsTool,
  rubricAuditTool,
  searchReadingsTool,
  syllabusTool,
  eventsTool,
  announcementsTool,
  portalTool,
  examSimulatorTool,
  saveQuestionsTool,
  bankQuestionsTool,
  bankSummaryTool,
];

/**
 * Crea y configura el servidor MCP con todas las herramientas registradas.
 */
export function createMcpServer(): Server {
  // Resolver credenciales y crear client
  const { url, token } = resolveCanvasCredentials();

  if (!token) {
    console.error(
      "⚠️ Advertencia: CANVAS_TOKEN no está definido en las variables de entorno ni en mcp_config.json."
    );
  }

  const client = new CanvasClient({ baseUrl: url, token });
  const hasToken = Boolean(token);

  // Crear servidor MCP
  const server = new Server(
    { name: SERVER_NAME, version: VERSION },
    { capabilities: { tools: {} } }
  );

  // Construir mapa de lookup: name → ToolDefinition
  const toolMap = new Map<string, ToolDefinition>();
  for (const tool of ALL_TOOLS) {
    toolMap.set(tool.name, tool);
  }

  // 1. Registro de herramientas (ListTools)
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: ALL_TOOLS.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
  }));

  // 2. Manejo de invocación (CallTool)
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const tool = toolMap.get(name);

    if (!tool) {
      return errorResponse(`Herramienta no implementada: ${name}`);
    }

    // Verificar autenticación si el tool la requiere
    if (tool.requiresAuth !== false && !hasToken) {
      return errorResponse(
        "ERROR: La variable de entorno CANVAS_TOKEN no está configurada. Por favor define CANVAS_TOKEN con tu token de Canvas LMS."
      );
    }

    const ctx: ToolContext = { client, hasToken };

    try {
      const response: ToolResponse = await tool.handler(args || {}, ctx);
      return response as any;
    } catch (error: any) {
      return errorResponse(
        `Error ejecutando ${name}: ${error.message || String(error)}`
      ) as any;
    }
  });

  return server;
}
