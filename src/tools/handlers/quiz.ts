import type { ToolDefinition } from "../_base.js";
import { textResponse } from "../_base.js";
import { GenerateQuizSchema } from "../schemas.js";
import { findReading, getFileInfo } from "../../canvas/content.service.js";
import { buildQuizPrompt } from "../../quizGenerator.js";

export const quizTool: ToolDefinition = {
  name: "s21_generate_practice_quiz",
  description:
    "Genera un simulacro de examen tipo API/parcial con preguntas multiple choice y justificaciones teóricas basado en la lectura oficial de Canvas. DIRECTIVA DE FLUJO: Cuando el usuario solicite preparar, rendir o entrenar para un examen interactivo, genera las preguntas con distractores y explicaciones académicas, guárdalas en SQLite con 's21_save_questions_to_bank' e invoca 's21_open_exam_simulator' con el 'course_id' correspondiente y 'start_exam': true para ofrecer la experiencia de examen interactiva.",
  inputSchema: {
    type: "object",
    properties: {
      course_id: { type: "number", description: "ID de la materia en Canvas." },
      module_number: { type: "number", description: "Número de módulo (1, 2, 3 o 4)." },
      reading_number: { type: "number", description: "Número de lectura (1, 2, 3 o 4)." },
      question_count: { type: "number", description: "Cantidad de preguntas a generar (por defecto 5)." },
    },
    required: ["course_id", "module_number", "reading_number"],
  },
  requiresAuth: true,
  handler: async (args, ctx) => {
    const parsed = GenerateQuizSchema.parse(args);
    const questionCount = parsed.question_count ?? 5;

    const readingInfo = await findReading(
      ctx.client,
      parsed.course_id,
      parsed.module_number,
      parsed.reading_number
    );
    if (!readingInfo) {
      throw new Error(
        `No se encontró la lectura para el Módulo ${parsed.module_number}, Lectura ${parsed.reading_number}`
      );
    }

    let extractedText = "";
    if (readingInfo.download_url || readingInfo.file_id) {
      let dlUrl = readingInfo.download_url;
      if (!dlUrl && readingInfo.file_id) {
        const fInfo = await getFileInfo(ctx.client, readingInfo.file_id);
        dlUrl = fInfo.url || fInfo.download_url;
      }
      if (dlUrl) {
        const extract = await ctx.client.downloadPdf(dlUrl, 10);
        extractedText = extract.text;
      }
    }

    if (!extractedText && readingInfo.description_markdown) {
      extractedText = readingInfo.description_markdown;
    }

    if (!extractedText) {
      throw new Error(
        "No se pudo extraer contenido textual suficiente de la lectura para generar el simulacro."
      );
    }

    const prompt = buildQuizPrompt(
      `Materia ${parsed.course_id}`,
      parsed.module_number,
      parsed.reading_number,
      readingInfo.item_title,
      extractedText.slice(0, 5000),
      questionCount
    );

    return textResponse(
      `=== Guía de Simulacro de Examen Generada ===\nMateria ID: ${parsed.course_id}\nMódulo: ${parsed.module_number} | Lectura: ${parsed.reading_number} (${readingInfo.item_title})\nPreguntas solicitadas: ${questionCount}\n\n${prompt}`
    );
  },
};
