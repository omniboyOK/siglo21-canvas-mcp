import type { ToolDefinition } from "../_base.js";
import { jsonResponse } from "../_base.js";
import { getUpcomingEvents } from "../../canvas/events.service.js";

export const eventsTool: ToolDefinition = {
  name: "s21_get_upcoming_events",
  description:
    "Obtiene las próximas entregas, parciales y eventos agendados en el calendario del alumno.",
  inputSchema: {
    type: "object",
    properties: {},
  },
  requiresAuth: true,
  handler: async (_args, ctx) => {
    const data = await getUpcomingEvents(ctx.client);
    return jsonResponse(data);
  },
};
