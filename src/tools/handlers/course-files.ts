import type { ToolDefinition } from "../_base.js";
import { jsonResponse } from "../_base.js";
import { CourseIdSchema } from "../schemas.js";
import { getCourseFiles } from "../../canvas/content.service.js";

export const courseFilesTool: ToolDefinition = {
  name: "s21_get_course_files",
  description:
    "Lista todos los archivos, lecturas y documentos disponibles en una materia, con soporte de fallback si la pestaña de archivos está bloqueada.",
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
    const data = await getCourseFiles(ctx.client, parsed.course_id);
    return jsonResponse(data);
  },
};
