import type { ToolDefinition } from "../_base.js";
import { textResponse } from "../_base.js";
import { GetReadingSchema } from "../schemas.js";
import { findReading, getFileInfo } from "../../canvas/content.service.js";
import { getCourse } from "../../canvas/courses.service.js";
import * as storageManager from "../../storageManager.js";

export const readingTool: ToolDefinition = {
  name: "s21_get_reading",
  description:
    "Busca y resuelve automáticamente una lectura o actividad específica por Módulo y Número de Lectura, con opción de extraer el texto del PDF directamente.",
  inputSchema: {
    type: "object",
    properties: {
      course_id: { type: "number", description: "ID de la materia en Canvas." },
      module_number: { type: "number", description: "Número de módulo (1, 2, 3 o 4)." },
      reading_number: { type: "number", description: "Número de lectura o actividad (1, 2, 3 o 4)." },
      auto_read_pdf: { type: "boolean", description: "Si es true (por defecto), descarga y extrae el texto del PDF automáticamente." },
    },
    required: ["course_id", "module_number", "reading_number"],
  },
  requiresAuth: true,
  handler: async (args, ctx) => {
    const parsed = GetReadingSchema.parse(args);
    const { course_id: courseId, module_number: moduleNumber, reading_number: readingNumber } = parsed;
    const autoReadPdf = parsed.auto_read_pdf !== false;

    // 1. Revisar si ya existe en almacenamiento local (Offline-First)
    const local = storageManager.getReading(courseId, moduleNumber, readingNumber);
    if (local) {
      return textResponse(
        `=== Lectura Guardada en Disco (Offline-First) ===\nMateria ID: ${courseId}\nMódulo: ${moduleNumber}\nLectura: ${readingNumber}\nTítulo: ${local.title}\nArchivo MD: ${local.mdPath}${local.pdfPath ? `\nArchivo PDF: ${local.pdfPath}` : ""}\n\n${local.markdown}`
      );
    }

    const readingInfo = await findReading(ctx.client, courseId, moduleNumber, readingNumber);

    if (!readingInfo) {
      return textResponse(
        `No se encontró lectura o actividad específica para el Módulo ${moduleNumber}, Lectura ${readingNumber} en el curso ${courseId}.`
      );
    }

    let pdfContentText = "";
    let pdfExtract: any = null;
    if (autoReadPdf && (readingInfo.download_url || readingInfo.file_id)) {
      try {
        let dlUrl = readingInfo.download_url;
        if (!dlUrl && readingInfo.file_id) {
          const fInfo = await getFileInfo(ctx.client, readingInfo.file_id);
          dlUrl = fInfo.url || fInfo.download_url;
        }
        if (dlUrl) {
          pdfExtract = await ctx.client.downloadPdf(dlUrl, 30);
          pdfContentText = `\n\n--- Texto Extraído del PDF (${pdfExtract.numPages} págs) ---\n${pdfExtract.text}`;
        }
      } catch (e: any) {
        pdfContentText = `\n\n(No se pudo extraer el texto del PDF automáticamente: ${e.message})`;
      }
    }

    // Guardar automáticamente en disco para futuras consultas
    const contentToSave = pdfExtract?.text || readingInfo.description_markdown || "";
    if (contentToSave) {
      try {
        let courseName: string | undefined;
        try {
          const c = await getCourse(ctx.client, courseId);
          if (c?.name) courseName = c.name;
        } catch {}
        storageManager.saveReading(
          courseId,
          moduleNumber,
          readingNumber,
          readingInfo.item_title || `Lectura ${readingNumber}`,
          contentToSave,
          pdfExtract?.buffer,
          courseName
        );
      } catch (err) {
        console.error("[Storage] Error al auto-guardar lectura en MCP:", err);
      }
    }

    return textResponse(
      `=== Lectura Encontrada ===\nMódulo: ${readingInfo.module_name}\nTítulo: ${readingInfo.item_title}\nTipo: ${readingInfo.type}\nFile ID: ${readingInfo.file_id || "N/A"}\nURL: ${readingInfo.url || readingInfo.download_url || "N/A"}${readingInfo.description_markdown ? `\n\nDescripción:\n${readingInfo.description_markdown}` : ""}${pdfContentText}`
    );
  },
};
