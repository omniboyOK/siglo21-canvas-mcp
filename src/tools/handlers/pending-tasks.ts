import type { ToolDefinition } from "../_base.js";
import { jsonResponse } from "../_base.js";
import { getPendingTasks } from "../../canvas/courses.service.js";

export const pendingTasksTool: ToolDefinition = {
  name: "s21_get_pending_tasks",
  description:
    "Obtiene la agenda de entregas, TPs y tareas pendientes de todas las materias activas, ordenadas cronológicamente con días restantes.",
  inputSchema: {
    type: "object",
    properties: {},
  },
  requiresAuth: true,
  handler: async (_args, ctx) => {
    const data = await getPendingTasks(ctx.client);
    return jsonResponse(data);
  },
};
