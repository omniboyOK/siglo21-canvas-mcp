#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { CanvasClient } from "./canvasClient.js";
import { buildQuizPrompt } from "./quizGenerator.js";
import { startInteractiveGuideServer } from "./interactiveGuide.js";
import { startExamSimulatorServer } from "./examSimulatorServer.js";
import { ExamRepository } from "./db/examRepository.js";

// Configuración desde entorno
const CANVAS_URL = (process.env.CANVAS_URL || "https://siglo21.instructure.com").replace(/\/+$/, "");
const CANVAS_TOKEN = process.env.CANVAS_TOKEN || "";

if (!CANVAS_TOKEN) {
  console.error("⚠️ Advertencia: CANVAS_TOKEN no está definido en las variables de entorno.");
}

const client = new CanvasClient({
  baseUrl: CANVAS_URL,
  token: CANVAS_TOKEN,
});

// Inicializar Servidor MCP
const server = new Server(
  {
    name: "s21-canvas-mcp",
    version: "1.2.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// 1. Registro de Herramientas
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "s21_get_my_profile",
        description: "Obtiene el perfil del alumno en Siglo 21 Canvas (nombre, id, correo, avatar).",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "s21_list_courses",
        description: "Lista las materias del alumno (activas o históricas) con soporte de búsqueda y formato compacto optimizado.",
        inputSchema: {
          type: "object",
          properties: {
            include_concluded: {
              type: "boolean",
              description: "Si es true, incluye materias finalizadas/pasadas. Por defecto false (solo materias activas).",
            },
            search: {
              type: "string",
              description: "Término opcional para filtrar por nombre o código de materia (ej: 'matematica', 'programacion', 'CEX332').",
            },
            compact: {
              type: "boolean",
              description: "Si es true (por defecto), devuelve solo los campos clave (id, nombre, código, período, notas).",
            },
          },
        },
      },
      {
        name: "s21_get_pending_tasks",
        description: "Obtiene la agenda de entregas, TPs y tareas pendientes de todas las materias activas, ordenadas cronológicamente con días restantes.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "s21_check_academic_status",
        description: "Calcula el estado académico (promedio de TPs, notas cargadas y proyección de notas mínimas para Promoción Directa o Regularidad).",
        inputSchema: {
          type: "object",
          properties: {
            course_id: {
              type: "number",
              description: "ID de la materia en Canvas (ej: 34584).",
            },
            target_promo_grade: {
              type: "number",
              description: "Nota mínima objetivo para Promoción Directa (por defecto 7).",
            },
            target_regular_grade: {
              type: "number",
              description: "Nota mínima objetivo para Regularidad (por defecto 5).",
            },
          },
          required: ["course_id"],
        },
      },
      {
        name: "s21_get_assignments",
        description: "Obtiene los Trabajos Prácticos (TP1 a TP4), fechas de entrega, consignas limpias en Markdown y rúbricas.",
        inputSchema: {
          type: "object",
          properties: {
            course_id: {
              type: "number",
              description: "ID de la materia en Canvas.",
            },
            clean_content: {
              type: "boolean",
              description: "Si es true (por defecto), limpia el HTML convirtiéndolo a Markdown legible.",
            },
          },
          required: ["course_id"],
        },
      },
      {
        name: "s21_get_modules",
        description: "Obtiene la estructura de módulos (SAM), lecturas y actividades organizadas por unidad temática.",
        inputSchema: {
          type: "object",
          properties: {
            course_id: {
              type: "number",
              description: "ID de la materia en Canvas.",
            },
            clean_content: {
              type: "boolean",
              description: "Si es true (por defecto), reduce el payload limpiando metadatos redundantes.",
            },
          },
          required: ["course_id"],
        },
      },
      {
        name: "s21_get_course_files",
        description: "Lista todos los archivos, lecturas y documentos disponibles en una materia, con soporte de fallback si la pestaña de archivos está bloqueada.",
        inputSchema: {
          type: "object",
          properties: {
            course_id: {
              type: "number",
              description: "ID de la materia en Canvas.",
            },
          },
          required: ["course_id"],
        },
      },
      {
        name: "s21_read_pdf_content",
        description: "Descarga en memoria y extrae el texto completo de un PDF de lectura/actividad de Canvas para resumir o estudiar.",
        inputSchema: {
          type: "object",
          properties: {
            file_id: {
              type: "number",
              description: "ID numérico del archivo en Canvas (opcional si se pasa download_url).",
            },
            download_url: {
              type: "string",
              description: "URL directa de descarga del archivo en Canvas.",
            },
            max_pages: {
              type: "number",
              description: "Número máximo de páginas a leer (opcional).",
            },
          },
        },
      },
      {
        name: "s21_get_reading",
        description: "Busca y resuelve automáticamente una lectura o actividad específica por Módulo y Número de Lectura, con opción de extraer el texto del PDF directamente.",
        inputSchema: {
          type: "object",
          properties: {
            course_id: {
              type: "number",
              description: "ID de la materia en Canvas.",
            },
            module_number: {
              type: "number",
              description: "Número de módulo (1, 2, 3 o 4).",
            },
            reading_number: {
              type: "number",
              description: "Número de lectura o actividad (1, 2, 3 o 4).",
            },
            auto_read_pdf: {
              type: "boolean",
              description: "Si es true (por defecto), descarga y extrae el texto del PDF automáticamente.",
            },
          },
          required: ["course_id", "module_number", "reading_number"],
        },
      },
      {
        name: "s21_generate_practice_quiz",
        description: "Genera un simulacro de examen tipo API/parcial con preguntas multiple choice y justificaciones teóricas basado en la lectura oficial de Canvas. DIRECTIVA DE FLUJO: Cuando el usuario solicite preparar, rendir o entrenar para un examen interactivo, genera las preguntas con distractores y explicaciones académicas, guárdalas en SQLite con 's21_save_questions_to_bank' e invoca 's21_open_exam_simulator' con el 'course_id' correspondiente y 'start_exam': true para ofrecer la experiencia de examen interactiva.",
        inputSchema: {
          type: "object",
          properties: {
            course_id: {
              type: "number",
              description: "ID de la materia en Canvas.",
            },
            module_number: {
              type: "number",
              description: "Número de módulo (1, 2, 3 o 4).",
            },
            reading_number: {
              type: "number",
              description: "Número de lectura (1, 2, 3 o 4).",
            },
            question_count: {
              type: "number",
              description: "Cantidad de preguntas a generar (por defecto 5).",
            },
          },
          required: ["course_id", "module_number", "reading_number"],
        },
      },
      {
        name: "s21_get_discussion_topics",
        description: "Obtiene los foros de debate del curso (incluyendo foros obligatorios para TP2 grupal) y sus consignas.",
        inputSchema: {
          type: "object",
          properties: {
            course_id: {
              type: "number",
              description: "ID de la materia en Canvas.",
            },
          },
          required: ["course_id"],
        },
      },
      {
        name: "s21_audit_rubric",
        description: "Compara el borrador de un Trabajo Práctico contra la rúbrica oficial de Canvas y evalúa el puntaje proyectado por criterio.",
        inputSchema: {
          type: "object",
          properties: {
            course_id: {
              type: "number",
              description: "ID de la materia en Canvas.",
            },
            assignment_id: {
              type: "number",
              description: "ID del Trabajo Práctico en Canvas.",
            },
            draft_text: {
              type: "string",
              description: "Texto o desarrollo del borrador redactado por el alumno.",
            },
          },
          required: ["course_id", "assignment_id", "draft_text"],
        },
      },
      {
        name: "s21_search_readings",
        description: "Realiza una búsqueda transversal de conceptos o palabras clave en todas las lecturas y PDFs descargados del alumno.",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Término, tema o concepto a buscar (ej: 'algoritmo de euclides', 'derivada', 'árbol binario').",
            },
          },
          required: ["query"],
        },
      },
      {
        name: "s21_get_syllabus",
        description: "Obtiene el programa general, syllabus y datos docentes de una materia.",
        inputSchema: {
          type: "object",
          properties: {
            course_id: {
              type: "number",
              description: "ID de la materia en Canvas.",
            },
          },
          required: ["course_id"],
        },
      },
      {
        name: "s21_get_upcoming_events",
        description: "Obtiene las próximas entregas, parciales y eventos agendados en el calendario del alumno.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "s21_get_announcements",
        description: "Obtiene los avisos y anuncios publicados por profesores con texto limpio en Markdown.",
        inputSchema: {
          type: "object",
          properties: {
            course_ids: {
              type: "array",
              items: { type: "number" },
              description: "Lista opcional de IDs de materias para filtrar los avisos.",
            },
          },
        },
      },
      {
        name: "s21_open_interactive_portal",
        description: "Abre el portal interactivo unificado de Universidad Siglo 21 (pantalla de inicio con bienvenida al alumno, métricas, accesos directos y catálogo de herramientas).",
        inputSchema: {
          type: "object",
          properties: {
            port: {
              type: "number",
              description: "Puerto HTTP opcional para el servidor local (por defecto 42122).",
            },
            auto_open: {
              type: "boolean",
              description: "Si es true (por defecto), abre automáticamente la ventana en modo aplicación.",
            },
          },
        },
      },
      {
        name: "s21_open_exam_simulator",
        description: "Abre el portal institucional interactivo posicionado directamente en el Simulador de Exámenes (preparación de parciales tipo API, temporizador, banco de preguntas SQLite y notas). DIRECTIVA DE FLUJO: Soporta 'course_id', 'mode' ('exam' o 'practice') y 'start_exam': true para iniciar inmediatamente el examen al abrir la aplicación sin requerir clics manuales del usuario.",
        inputSchema: {
          type: "object",
          properties: {
            port: {
              type: "number",
              description: "Puerto HTTP opcional para el servidor local (por defecto 42122).",
            },
            auto_open: {
              type: "boolean",
              description: "Si es true (por defecto), abre automáticamente la ventana en modo aplicación.",
            },
            course_id: {
              type: "number",
              description: "ID opcional de la materia en Canvas (ej: 34584) para pre-seleccionar o iniciar el examen directamente.",
            },
            mode: {
              type: "string",
              enum: ["exam", "practice", "real_exam"],
              description: "Modalidad opcional del simulador: 'exam' (simulacro cronometrado) o 'practice' (modo práctica y estudio con feedback inmediato).",
            },
            start_exam: {
              type: "boolean",
              description: "Si es true y se especifica course_id, inicia el examen automáticamente sin requerir clics adicionales.",
            },
          },
        },
      },
      {
        name: "s21_save_questions_to_bank",
        description: "Guarda un lote de preguntas de examen en la base de datos SQLite local, categorizadas por materia, módulo, lectura y tema, con distractores y justificación académica. DIRECTIVA DE FLUJO: Tras guardar preguntas en el banco para una materia o cuando el alumno exprese intención de rendir/practicar, invoca 's21_open_exam_simulator' con el 'course_id' correspondiente para abrirle el entorno de examen interactivo.",
        inputSchema: {
          type: "object",
          properties: {
            course_id: {
              type: "number",
              description: "ID numérico de la materia en Canvas (ej: 34584).",
            },
            course_name: {
              type: "string",
              description: "Nombre de la materia (ej: 'Arquitectura de Software').",
            },
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
                  options: {
                    type: "array",
                    items: { type: "string" },
                    description: "Lista de opciones múltiples (usualmente 4 opciones: A, B, C, D)",
                  },
                  correct_option_index: {
                    type: "number",
                    description: "Índice de la opción correcta (0 para A, 1 para B, 2 para C, 3 para D)",
                  },
                  explanation: {
                    type: "string",
                    description: "Justificación académica detallada explicando por qué la opción correcta es la adecuada y por qué los distractores son incorrectos.",
                  },
                  difficulty: {
                    type: "string",
                    enum: ["easy", "medium", "hard"],
                    description: "Dificultad de la pregunta (por defecto 'medium')",
                  },
                },
                required: ["module_number", "question_text", "options", "correct_option_index", "explanation"],
              },
            },
          },
          required: ["course_id", "course_name", "questions"],
        },
      },
      {
        name: "s21_get_bank_questions",
        description: "Obtiene las preguntas existentes guardadas en el banco local SQLite para una materia. Permite consultar el contenido del banco, verificar preguntas antes de generar nuevas (evitando duplicados), o revisar preguntas específicas con el alumno directamente en el chat.",
        inputSchema: {
          type: "object",
          properties: {
            course_id: {
              type: "number",
              description: "ID numérico de la materia en Canvas (ej: 34584).",
            },
            module_number: {
              type: "number",
              description: "Número de módulo opcional (1-4) para filtrar las preguntas.",
            },
            limit: {
              type: "number",
              description: "Cantidad máxima de preguntas a recuperar (opcional, ej: 20).",
            },
          },
          required: ["course_id"],
        },
      },
      {
        name: "s21_get_exam_bank_summary",
        description: "Consulta el resumen del banco de preguntas y estadísticas de exámenes guardados en la base de datos SQLite local (materias registradas, cantidad de preguntas por módulo, historial de intentos y promedios).",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
    ],
  };
});

// 2. Manejo de Invocación de Herramientas
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === "s21_open_interactive_portal" || name === "s21_open_interactive_guide") {
    try {
      const port = args?.port ? Number(args?.port) : 42122;
      const autoOpen = args?.auto_open !== false;
      const initialTab = name === "s21_open_interactive_guide" ? "mcp" : "home";
      const result = await startExamSimulatorServer(port, autoOpen, initialTab);
      return {
        content: [
          {
            type: "text",
            text: `🚀 Portal interactivo unificado disponible en ${result.url}\n\nSe ha abierto en ventana de escritorio independiente (App Mode) con la interfaz oficial de Universidad Siglo 21.\nPuedes consultar tu estado de cursada, rendir simulacros o explorar las herramientas MCP.`,
          },
        ],
      };
    } catch (error: any) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `Error al iniciar el portal interactivo: ${error.message || String(error)}`,
          },
        ],
      };
    }
  }

  if (name === "s21_open_exam_simulator") {
    try {
      const port = args?.port ? Number(args?.port) : 42122;
      const autoOpen = args?.auto_open !== false;
      const courseId = args?.course_id ? Number(args?.course_id) : undefined;
      const mode = args?.mode ? (String(args?.mode) as "exam" | "practice" | "real_exam") : undefined;
      const startExam = args?.start_exam === true;

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

      return {
        content: [
          {
            type: "text",
            text: `🎯 Simulador de Exámenes iniciado con éxito en ${result.url}\n\nSe ha abierto el portal directamente en la pestaña del Simulador con interfaz institucional Siglo 21 y motor SQLite local.${detailsText}\nPuedes configurar simulacros cronometrados (formato API), modo práctica con feedback inmediato, explorar el banco de preguntas o revisar tu historial y estadísticas.`,
          },
        ],
      };
    } catch (error: any) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `Error al iniciar el simulador de exámenes: ${error.message || String(error)}`,
          },
        ],
      };
    }
  }

  if (name === "s21_get_bank_questions") {
    try {
      const courseId = Number(args?.course_id);
      if (!courseId) {
        throw new Error("El parámetro 'course_id' es requerido y debe ser un número.");
      }
      const moduleNumber = args?.module_number ? Number(args?.module_number) : undefined;
      const limit = args?.limit ? Number(args?.limit) : undefined;

      const questions = ExamRepository.getQuestions(courseId, moduleNumber, limit);
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

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(formatted, null, 2),
          },
        ],
      };
    } catch (error: any) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `Error al consultar preguntas del banco SQLite: ${error.message || String(error)}`,
          },
        ],
      };
    }
  }

  if (name === "s21_save_questions_to_bank") {
    try {
      const courseId = Number(args?.course_id);
      const courseName = String(args?.course_name || `Materia ${courseId}`);
      const questions = Array.isArray(args?.questions) ? args?.questions : [];

      if (!courseId || questions.length === 0) {
        throw new Error("course_id y un arreglo no vacío de 'questions' son requeridos.");
      }

      const res = ExamRepository.saveQuestions(courseId, courseName, questions as any);
      return {
        content: [
          {
            type: "text",
            text: `✅ Se guardaron ${res.insertedCount} preguntas exitosamente en SQLite para la materia "${courseName}" (ID: ${courseId}).\nYa están disponibles en el banco y listas para ser seleccionadas aleatoriamente en los simulacros de examen.`,
          },
        ],
      };
    } catch (error: any) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `Error al guardar preguntas en el banco SQLite: ${error.message || String(error)}`,
          },
        ],
      };
    }
  }

  if (name === "s21_get_exam_bank_summary") {
    try {
      const summary = ExamRepository.getCoursesSummary();
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(summary, null, 2),
          },
        ],
      };
    } catch (error: any) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `Error al consultar el resumen del banco de preguntas: ${error.message || String(error)}`,
          },
        ],
      };
    }
  }

  if (!CANVAS_TOKEN) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: "ERROR: La variable de entorno CANVAS_TOKEN no está configurada. Por favor define CANVAS_TOKEN con tu token de Canvas LMS.",
        },
      ],
    };
  }

  try {
    switch (name) {
      case "s21_get_my_profile": {
        const data = await client.getSelf();
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      }

      case "s21_list_courses": {
        const includeConcluded = Boolean(args?.include_concluded);
        const search = args?.search as string | undefined;
        const compact = args?.compact !== false;
        const data = await client.getCourses({ includeConcluded, search, compact });
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      }

      case "s21_get_pending_tasks": {
        const data = await client.getPendingTasks();
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      }

      case "s21_check_academic_status": {
        const courseId = Number(args?.course_id);
        if (!courseId) throw new Error("course_id es requerido");
        const targetPromo = args?.target_promo_grade !== undefined ? Number(args?.target_promo_grade) : 7;
        const targetRegular = args?.target_regular_grade !== undefined ? Number(args?.target_regular_grade) : 5;
        const data = await client.getAcademicStatus(courseId, targetPromo, targetRegular);
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      }

      case "s21_get_assignments": {
        const courseId = Number(args?.course_id);
        if (!courseId) throw new Error("course_id es requerido");
        const cleanContent = args?.clean_content !== false;
        const data = await client.getAssignments(courseId, cleanContent);
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      }

      case "s21_get_modules": {
        const courseId = Number(args?.course_id);
        if (!courseId) throw new Error("course_id es requerido");
        const cleanContent = args?.clean_content !== false;
        const data = await client.getModules(courseId, cleanContent);
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      }

      case "s21_get_course_files": {
        const courseId = Number(args?.course_id);
        if (!courseId) throw new Error("course_id es requerido");
        const data = await client.getCourseFiles(courseId);
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      }

      case "s21_read_pdf_content": {
        let downloadUrl = args?.download_url as string | undefined;
        const fileId = args?.file_id ? Number(args?.file_id) : undefined;
        const maxPages = args?.max_pages ? Number(args?.max_pages) : undefined;

        if (!downloadUrl && fileId) {
          const fileInfo = await client.getFileInfo(fileId);
          downloadUrl = fileInfo.url || fileInfo.download_url;
        }

        if (!downloadUrl) {
          throw new Error("Debes proporcionar 'file_id' o 'download_url'");
        }

        const extract = await client.downloadPdf(downloadUrl, maxPages);
        return {
          content: [
            {
              type: "text",
              text: `=== Contenido del Documento PDF ===\nPáginas: ${extract.numPages}\nCaracteres: ${extract.charCount}\n\n${extract.text}`,
            },
          ],
        };
      }

      case "s21_get_reading": {
        const courseId = Number(args?.course_id);
        const moduleNumber = Number(args?.module_number);
        const readingNumber = Number(args?.reading_number);
        const autoReadPdf = args?.auto_read_pdf !== false;

        if (!courseId || !moduleNumber || !readingNumber) {
          throw new Error("course_id, module_number y reading_number son requeridos");
        }

        const readingInfo = await client.findReading(courseId, moduleNumber, readingNumber);

        if (!readingInfo) {
          return {
            content: [
              {
                type: "text",
                text: `No se encontró lectura o actividad específica para el Módulo ${moduleNumber}, Lectura ${readingNumber} en el curso ${courseId}.`,
              },
            ],
          };
        }

        let pdfContentText = "";
        if (autoReadPdf && (readingInfo.download_url || readingInfo.file_id)) {
          try {
            let dlUrl = readingInfo.download_url;
            if (!dlUrl && readingInfo.file_id) {
              const fInfo = await client.getFileInfo(readingInfo.file_id);
              dlUrl = fInfo.url || fInfo.download_url;
            }
            if (dlUrl) {
              const extract = await client.downloadPdf(dlUrl, 15);
              pdfContentText = `\n\n--- Texto Extraído del PDF (${extract.numPages} págs) ---\n${extract.text}`;
            }
          } catch (e: any) {
            pdfContentText = `\n\n(No se pudo extraer el texto del PDF automáticamente: ${e.message})`;
          }
        }

        return {
          content: [
            {
              type: "text",
              text: `=== Lectura Encontrada ===\nMódulo: ${readingInfo.module_name}\nTítulo: ${readingInfo.item_title}\nTipo: ${readingInfo.type}\nFile ID: ${readingInfo.file_id || "N/A"}\nURL: ${readingInfo.url || readingInfo.download_url || "N/A"}${readingInfo.description_markdown ? `\n\nDescripción:\n${readingInfo.description_markdown}` : ""}${pdfContentText}`,
            },
          ],
        };
      }

      case "s21_generate_practice_quiz": {
        const courseId = Number(args?.course_id);
        const moduleNumber = Number(args?.module_number);
        const readingNumber = Number(args?.reading_number);
        const questionCount = args?.question_count ? Number(args?.question_count) : 5;

        const readingInfo = await client.findReading(courseId, moduleNumber, readingNumber);
        if (!readingInfo) {
          throw new Error(`No se encontró la lectura para el Módulo ${moduleNumber}, Lectura ${readingNumber}`);
        }

        let extractedText = "";
        if (readingInfo.download_url || readingInfo.file_id) {
          let dlUrl = readingInfo.download_url;
          if (!dlUrl && readingInfo.file_id) {
            const fInfo = await client.getFileInfo(readingInfo.file_id);
            dlUrl = fInfo.url || fInfo.download_url;
          }
          if (dlUrl) {
            const extract = await client.downloadPdf(dlUrl, 10);
            extractedText = extract.text;
          }
        }

        if (!extractedText && readingInfo.description_markdown) {
          extractedText = readingInfo.description_markdown;
        }

        if (!extractedText) {
          throw new Error("No se pudo extraer contenido textual suficiente de la lectura para generar el simulacro.");
        }

        const prompt = buildQuizPrompt(
          `Materia ${courseId}`,
          moduleNumber,
          readingNumber,
          readingInfo.item_title,
          extractedText.slice(0, 5000),
          questionCount
        );

        return {
          content: [
            {
              type: "text",
              text: `=== Guía de Simulacro de Examen Generada ===\nMateria ID: ${courseId}\nMódulo: ${moduleNumber} | Lectura: ${readingNumber} (${readingInfo.item_title})\nPreguntas solicitadas: ${questionCount}\n\n${prompt}`,
            },
          ],
        };
      }

      case "s21_get_discussion_topics": {
        const courseId = Number(args?.course_id);
        if (!courseId) throw new Error("course_id es requerido");
        const data = await client.getDiscussionTopics(courseId);
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      }

      case "s21_audit_rubric": {
        const courseId = Number(args?.course_id);
        const assignmentId = Number(args?.assignment_id);
        const draftText = String(args?.draft_text || "");

        if (!courseId || !assignmentId || !draftText.trim()) {
          throw new Error("course_id, assignment_id y draft_text son requeridos");
        }

        const data = await client.auditAssignmentRubric(courseId, assignmentId, draftText);
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      }

      case "s21_search_readings": {
        const query = String(args?.query || "");
        if (!query.trim()) throw new Error("query es requerido");
        const data = await client.searchLocalReadings(query);
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      }

      case "s21_get_syllabus": {
        const courseId = Number(args?.course_id);
        if (!courseId) throw new Error("course_id es requerido");
        const data = await client.getSyllabus(courseId);
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      }

      case "s21_get_upcoming_events": {
        const data = await client.getUpcomingEvents();
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      }

      case "s21_get_announcements": {
        const courseIds = args?.course_ids as number[] | undefined;
        const data = await client.getAnnouncements(courseIds);
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      }

      default:
        throw new Error(`Herramienta no implementada: ${name}`);
    }
  } catch (error: any) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: `Error ejecutando ${name}: ${error.message || String(error)}`,
        },
      ],
    };
  }
});

// Conectar mediante transporte stdio
const transport = new StdioServerTransport();
await server.connect(transport);
