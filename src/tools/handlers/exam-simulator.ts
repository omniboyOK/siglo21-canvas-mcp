import type { ToolDefinition } from "../_base.js";
import { textResponse } from "../_base.js";
import { ExamSimulatorSchema } from "../schemas.js";
import { startExamSimulatorServer } from "../../server/portalServer.js";

export const examSimulatorTool: ToolDefinition = {
  name: "s21_open_exam_simulator",
  description:
    "Abre el portal institucional interactivo posicionado directamente en el Simulador de Exámenes (preparación de parciales tipo API, temporizador, banco de preguntas SQLite y notas). DIRECTIVA DE FLUJO: Soporta 'course_id', 'mode' ('exam' o 'practice') y 'start_exam': true para iniciar inmediatamente el examen al abrir la aplicación sin requerir clics manuales del usuario.",
  inputSchema: {
    type: "object",
    properties: {
      port: { type: "number", description: "Puerto HTTP opcional para el servidor local (por defecto 42122)." },
      auto_open: { type: "boolean", description: "Si es true (por defecto), abre automáticamente la ventana en modo aplicación." },
      course_id: { type: "number", description: "ID opcional de la materia en Canvas (ej: 34584) para pre-seleccionar o iniciar el examen directamente." },
      mode: { type: "string", enum: ["exam", "practice", "real_exam"], description: "Modalidad opcional del simulador: 'exam' (simulacro cronometrado) o 'practice' (modo práctica y estudio con feedback inmediato)." },
      start_exam: { type: "boolean", description: "Si es true y se especifica course_id, inicia el examen automáticamente sin requerir clics adicionales." },
    },
  },
  requiresAuth: false,
  handler: async (args) => {
    const parsed = ExamSimulatorSchema.parse(args);
    const port = parsed.port ?? 42122;
    const autoOpen = parsed.auto_open !== false;
    const courseId = parsed.course_id;
    const mode = parsed.mode ? (parsed.mode === "real_exam" ? "exam" : parsed.mode) as "exam" | "practice" : undefined;
    const startExam = parsed.start_exam === true;

    const result = await startExamSimulatorServer(port, autoOpen, "simulator", {
      courseId,
      mode,
      startExam,
    });

    const details: string[] = [];
    if (courseId) details.push(`• Materia pre-seleccionada: ID ${courseId}`);
    if (mode) details.push(`• Modalidad configurada: ${mode}`);
    if (startExam) details.push(`• Inicio automático activado: El examen arrancará inmediatamente.`);

    const detailsText = details.length > 0 ? `\n\nConfiguración directa:\n${details.join("\n")}` : "";

    return textResponse(
      `🎯 Simulador de Exámenes iniciado con éxito en ${result.url}\n\nSe ha abierto el portal directamente en la pestaña del Simulador con interfaz institucional Siglo 21 y motor SQLite local.${detailsText}\nPuedes configurar simulacros cronometrados (formato API), modo práctica con feedback inmediato, explorar el banco de preguntas o revisar tu historial y estadísticas.`
    );
  },
};
