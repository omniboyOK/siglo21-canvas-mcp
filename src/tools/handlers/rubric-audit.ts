import type { ToolDefinition } from "../_base.js";
import { jsonResponse } from "../_base.js";
import { AuditRubricSchema } from "../schemas.js";
import { auditAssignmentRubric } from "../../canvas/content.service.js";

export const rubricAuditTool: ToolDefinition = {
  name: "s21_audit_rubric",
  description:
    "Compara el borrador de un Trabajo Práctico contra la rúbrica oficial de Canvas y evalúa el puntaje proyectado por criterio.",
  inputSchema: {
    type: "object",
    properties: {
      course_id: { type: "number", description: "ID de la materia en Canvas." },
      assignment_id: { type: "number", description: "ID del Trabajo Práctico en Canvas." },
      draft_text: { type: "string", description: "Texto o desarrollo del borrador redactado por el alumno." },
    },
    required: ["course_id", "assignment_id", "draft_text"],
  },
  requiresAuth: true,
  handler: async (args, ctx) => {
    const parsed = AuditRubricSchema.parse(args);
    const data = await auditAssignmentRubric(ctx.client, parsed.course_id, parsed.assignment_id, parsed.draft_text);
    return jsonResponse(data);
  },
};
