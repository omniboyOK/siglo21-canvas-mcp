import type { ToolDefinition } from "../_base.js";
import { jsonResponse } from "../_base.js";
import { CourseIdSchema } from "../schemas.js";
import { getDiscussionTopics } from "../../canvas/content.service.js";

export const discussionsTool: ToolDefinition = {
  name: "s21_get_discussion_topics",
  description:
    "Obtiene los foros de debate del curso (incluyendo foros obligatorios para TP2 grupal) y sus consignas.",
  inputSchema: {
    type: "object",
    properties: {
      course_id: { type: "number", description: "ID de la materia en Canvas." },
    },
    required: ["course_id"],
  },
  requiresAuth: true,
  handler: async (args, ctx) => {
    const parsed = CourseIdSchema.parse(args);
    const data = await getDiscussionTopics(ctx.client, parsed.course_id);
    return jsonResponse(data);
  },
};
