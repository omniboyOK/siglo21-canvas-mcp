import type { ToolDefinition } from "../_base.js";
import { textResponse } from "../_base.js";
import { SaveQuestionsSchema } from "../schemas.js";
import { ExamRepository } from "../../db/examRepository.js";

export const saveQuestionsTool: ToolDefinition = {
  name: "s21_save_questions_to_bank",
  description:
    "Guarda un lote de preguntas de examen en la base de datos SQLite local, categorizadas por materia, módulo, lectura y tema, con distractores y justificación académica. DIRECTIVA DE FLUJO: Tras guardar preguntas en el banco para una materia o cuando el alumno exprese intención de rendir/practicar, invoca 's21_open_exam_simulator' con el 'course_id' correspondiente para abrirle el entorno de examen interactivo.",
  inputSchema: {
    type: "object",
    properties: {
      course_id: { type: "number", description: "ID numérico de la materia en Canvas (ej: 34584)." },
      course_name: { type: "string", description: "Nombre de la materia (ej: 'Arquitectura de Software')." },
      questions: {
        type: "array",
        description: "Lista de preguntas a guardar en SQLite.",
        items: {
          type: "object",
          properties: {
            module_number: { type: "number", description: "Módulo (1-4)" },
            reading_number: { type: "number", description: "Lectura (1-4)" },
            topic: { type: "string", description: "Tema o eje conceptual" },
            question_text: { type: "string", description: "Consigna o situación problemática de la pregunta" },
            options: { type: "array", items: { type: "string" }, description: "Lista de opciones múltiples (usualmente 4 opciones: A, B, C, D)" },
            correct_option_index: { type: "number", description: "Índice de la opción correcta (0 para A, 1 para B, 2 para C, 3 para D)" },
            explanation: { type: "string", description: "Justificación académica detallada explicando por qué la opción correcta es la adecuada y por qué los distractores son incorrectos." },
            difficulty: { type: "string", enum: ["easy", "medium", "hard"], description: "Dificultad de la pregunta (por defecto 'medium')" },
          },
          required: ["module_number", "question_text", "options", "correct_option_index", "explanation"],
        },
      },
    },
    required: ["course_id", "course_name", "questions"],
  },
  requiresAuth: false,
  handler: async (args) => {
    const parsed = SaveQuestionsSchema.parse(args);
    const res = ExamRepository.saveQuestions(parsed.course_id, parsed.course_name, parsed.questions as any);
    return textResponse(
      `✅ Se guardaron ${res.insertedCount} preguntas exitosamente en SQLite para la materia "${parsed.course_name}" (ID: ${parsed.course_id}).\nYa están disponibles en el banco y listas para ser seleccionadas aleatoriamente en los simulacros de examen.`
    );
  },
};
