import type { ToolDefinition } from "../_base.js";
import { jsonResponse } from "../_base.js";
import { AnnouncementsSchema } from "../schemas.js";
import { getAnnouncements } from "../../canvas/content.service.js";

export const announcementsTool: ToolDefinition = {
  name: "s21_get_announcements",
  description:
    "Obtiene los avisos y anuncios publicados por profesores con texto limpio en Markdown.",
  inputSchema: {
    type: "object",
    properties: {
      course_ids: {
        type: "array",
        items: { type: "number" },
        description: "Lista opcional de IDs de materias para filtrar los avisos.",
      },
    },
  },
  requiresAuth: true,
  handler: async (args, ctx) => {
    const parsed = AnnouncementsSchema.parse(args);
    const data = await getAnnouncements(ctx.client, parsed.course_ids);
    return jsonResponse(data);
  },
};
