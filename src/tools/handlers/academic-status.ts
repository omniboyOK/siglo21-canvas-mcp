import type { ToolDefinition } from "../_base.js";
import { jsonResponse } from "../_base.js";
import { AcademicStatusSchema } from "../schemas.js";
import { getAcademicStatus } from "../../canvas/courses.service.js";

export const academicStatusTool: ToolDefinition = {
  name: "s21_check_academic_status",
  description:
    "Calcula el estado académico (promedio de TPs, notas cargadas y proyección de notas mínimas para Promoción Directa o Regularidad).",
  inputSchema: {
    type: "object",
    properties: {
      course_id: { type: "number", description: "ID de la materia en Canvas (ej: 34584)." },
      target_promo_grade: { type: "number", description: "Nota mínima objetivo para Promoción Directa (por defecto 7)." },
      target_regular_grade: { type: "number", description: "Nota mínima objetivo para Regularidad (por defecto 5)." },
    },
    required: ["course_id"],
  },
  requiresAuth: true,
  handler: async (args, ctx) => {
    const parsed = AcademicStatusSchema.parse(args);
    const data = await getAcademicStatus(
      ctx.client,
      parsed.course_id,
      parsed.target_promo_grade ?? 7,
      parsed.target_regular_grade ?? 5
    );
    return jsonResponse(data);
  },
};
