import type { ToolDefinition } from "../_base.js";
import { jsonResponse } from "../_base.js";
import { BankQuestionsSchema } from "../schemas.js";
import { ExamRepository } from "../../db/examRepository.js";

export const bankQuestionsTool: ToolDefinition = {
  name: "s21_get_bank_questions",
  description:
    "Obtiene las preguntas existentes guardadas en el banco local SQLite para una materia. Permite consultar el contenido del banco, verificar preguntas antes de generar nuevas (evitando duplicados), o revisar preguntas específicas con el alumno directamente en el chat.",
  inputSchema: {
    type: "object",
    properties: {
      course_id: { type: "number", description: "ID numérico de la materia en Canvas (ej: 34584)." },
      module_number: { type: "number", description: "Número de módulo opcional (1-4) para filtrar las preguntas." },
      limit: { type: "number", description: "Cantidad máxima de preguntas a recuperar (opcional, ej: 20)." },
    },
    required: ["course_id"],
  },
  requiresAuth: false,
  handler: async (args) => {
    const parsed = BankQuestionsSchema.parse(args);
    const questions = ExamRepository.getQuestions(
      parsed.course_id,
      parsed.module_number,
      parsed.limit
    );
    const formatted = questions.map((q) => ({
      id: q.id,
      course_id: q.course_id,
      module_number: q.module_number,
      reading_number: q.reading_number,
      topic: q.topic,
      question_text: q.question_text,
      options: q.options,
      correct_index: q.correct_option_index,
      correct_option_index: q.correct_option_index,
      explanation: q.explanation,
      difficulty: q.difficulty,
      created_at: q.created_at,
    }));
    return jsonResponse(formatted);
  },
};
