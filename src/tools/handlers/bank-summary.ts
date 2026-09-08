import type { ToolDefinition } from "../_base.js";
import { jsonResponse } from "../_base.js";
import { ExamRepository } from "../../db/examRepository.js";

export const bankSummaryTool: ToolDefinition = {
  name: "s21_get_exam_bank_summary",
  description:
    "Consulta el resumen del banco de preguntas y estadísticas de exámenes guardados en la base de datos SQLite local (materias registradas, cantidad de preguntas por módulo, historial de intentos y promedios).",
  inputSchema: {
    type: "object",
    properties: {},
  },
  requiresAuth: false,
  handler: async () => {
    const summary = ExamRepository.getCoursesSummary();
    return jsonResponse(summary);
  },
};
