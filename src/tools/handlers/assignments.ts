import type { ToolDefinition } from "../_base.js";
import { jsonResponse } from "../_base.js";
import { AssignmentsSchema } from "../schemas.js";
import { getAssignments } from "../../canvas/content.service.js";

export const assignmentsTool: ToolDefinition = {
  name: "s21_get_assignments",
  description:
    "Obtiene los Trabajos Prácticos (TP1 a TP4), fechas de entrega, consignas limpias en Markdown y rúbricas.",
  inputSchema: {
    type: "object",
    properties: {
      course_id: { type: "number", description: "ID de la materia en Canvas." },
      clean_content: { type: "boolean", description: "Si es true (por defecto), limpia el HTML convirtiéndolo a Markdown legible." },
    },
    required: ["course_id"],
  },
  requiresAuth: true,
  handler: async (args, ctx) => {
    const parsed = AssignmentsSchema.parse(args);
    const data = await getAssignments(ctx.client, parsed.course_id, parsed.clean_content !== false);
    return jsonResponse(data);
  },
};
