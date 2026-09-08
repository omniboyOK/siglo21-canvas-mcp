import type { ToolDefinition } from "../_base.js";
import { jsonResponse } from "../_base.js";
import { CourseIdSchema } from "../schemas.js";
import { getSyllabus } from "../../canvas/content.service.js";

export const syllabusTool: ToolDefinition = {
  name: "s21_get_syllabus",
  description:
    "Obtiene el programa general, syllabus y datos docentes de una materia.",
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
    const data = await getSyllabus(ctx.client, parsed.course_id);
    return jsonResponse(data);
  },
};
