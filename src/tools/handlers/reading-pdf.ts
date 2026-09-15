import type { ToolDefinition } from "../_base.js";
import { textResponse, errorResponse } from "../_base.js";
import { GetReadingPdfSchema } from "../schemas.js";
import { findReading, getFileInfo } from "../../canvas/content.service.js";
import { getCourse } from "../../canvas/courses.service.js";
import { fetchSamReadingPdf } from "../../content/sam.js";
import { isCanvasUrl } from "../../content/pdf.js";
import { USER_AGENT } from "../../config/constants.js";
import * as storageManager from "../../storageManager.js";
import path from "node:path";
import fs from "node:fs";

export const readingPdfTool: ToolDefinition = {
  name: "s21_get_reading_pdf",
  description:
    "Descarga y guarda en disco el archivo PDF (.pdf) crudo original de una lectura o actividad académica sin convertirlo a Markdown, preservando el formato original oficial.",
  inputSchema: {
    type: "object",
    properties: {
      course_id: { type: "number", description: "ID de la materia en Canvas." },
      module_number: { type: "number", description: "Número de módulo (1 a 4)." },
      reading_number: { type: "number", description: "Número de lectura (1 a 4)." },
      output_dir: {
        type: "string",
        description: "Ruta personalizada opcional donde guardar el archivo .pdf. Si se omite, se guarda en la carpeta de la materia gestionada por storageManager.",
      },
    },
    required: ["course_id", "module_number", "reading_number"],
  },
  requiresAuth: true,
  handler: async (args, ctx) => {
    const parsed = GetReadingPdfSchema.parse(args);
    const {
      course_id: courseId,
      module_number: moduleNumber,
      reading_number: readingNumber,
      output_dir: outputDir,
    } = parsed;

    // Obtener información del curso para nombres claros de carpetas y metadatos
    let courseName: string | undefined;
    try {
      const c = await getCourse(ctx.client, courseId);
      if (c?.name) courseName = c.name;
    } catch {
      // Ignorar si falla la llamada al curso
    }

    // 1. Localizar la lectura usando el servicio central de Canvas y SAM
    const readingInfo = await findReading(ctx.client, courseId, moduleNumber, readingNumber);

    if (!readingInfo) {
      return textResponse(
        `No se encontró lectura o actividad específica para el Módulo ${moduleNumber}, Lectura ${readingNumber} en el curso ${courseId}.`
      );
    }

    const readingTitle = readingInfo.item_title || `Lectura ${readingNumber}`;
    let pdfBuffer: Buffer | null = null;
    let sourceUrl = "";
    let originType = "";

    // 2. Descargar según el origen del recurso
    // Caso A: Lectura interactiva SAM (meca.ues21.edu.ar / Articulate Rise 360 o HTML)
    if (readingInfo.type === "SAM" || readingInfo.url?.includes("meca.ues21.edu.ar")) {
      originType = "Lectura SAM (meca.ues21.edu.ar)";
      try {
        const samResult = await fetchSamReadingPdf(readingInfo.url!);
        pdfBuffer = samResult.buffer;
        sourceUrl = samResult.downloadUrl;
      } catch (err: any) {
        // Fallback: Si ya existía un PDF local descargado previamente, usarlo
        const existingLocal = storageManager.findLocalReadingFiles(courseId, moduleNumber, readingNumber);
        if (existingLocal?.pdfPath && fs.existsSync(existingLocal.pdfPath)) {
          pdfBuffer = fs.readFileSync(existingLocal.pdfPath);
          sourceUrl = "Caché local previo (fallback tras error de red)";
        } else {
          return errorResponse(
            `Error al descargar el PDF de la lectura SAM "${readingTitle}": ${err.message}`
          );
        }
      }
    } else {
      // Caso B: Lectura o TP alojado en archivos de Canvas LMS
      originType = "Canvas LMS";
      let downloadUrl = readingInfo.download_url;

      if (!downloadUrl && readingInfo.file_id) {
        try {
          const fInfo = await getFileInfo(ctx.client, readingInfo.file_id);
          downloadUrl = fInfo.url || fInfo.download_url;
        } catch (err: any) {
          return errorResponse(
            `Error al resolver archivo en Canvas (File ID: ${readingInfo.file_id}): ${err.message}`
          );
        }
      }

      if (!downloadUrl) {
        return errorResponse(
          `La lectura "${readingTitle}" (Módulo ${moduleNumber}, Lectura ${readingNumber}) no cuenta con un archivo descargable en Canvas.`
        );
      }

      sourceUrl = downloadUrl;

      try {
        const authHeaders = isCanvasUrl(downloadUrl, ctx.client.getBaseUrl())
          ? ctx.client.getAuthHeaders()
          : { "User-Agent": USER_AGENT };

        const res = await fetch(downloadUrl, { headers: authHeaders });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        }
        const ab = await res.arrayBuffer();
        pdfBuffer = Buffer.from(ab);
      } catch (err: any) {
        return errorResponse(
          `Error al descargar archivo PDF desde Canvas (${downloadUrl}): ${err.message}`
        );
      }
    }

    if (!pdfBuffer || pdfBuffer.length === 0) {
      return errorResponse(
        `El archivo PDF descargado para "${readingTitle}" está vacío o es inválido.`
      );
    }

    // 3. Persistir en disco
    const savedPath = storageManager.saveReadingPdfFile(
      courseId,
      moduleNumber,
      readingNumber,
      readingTitle,
      pdfBuffer,
      courseName,
      outputDir
    );

    const absolutePath = path.resolve(savedPath);
    const sizeBytes = pdfBuffer.length;
    const sizeFormatted =
      sizeBytes < 1024 * 1024
        ? `${(sizeBytes / 1024).toFixed(1)} KB`
        : `${(sizeBytes / (1024 * 1024)).toFixed(2)} MB`;

    return textResponse(
      `=== Descarga de Lectura en PDF Completada ===\n` +
      `Materia: ${courseName || `Materia ${courseId}`} (ID: ${courseId})\n` +
      `Módulo: ${moduleNumber}\n` +
      `Lectura: ${readingNumber}\n` +
      `Título: ${readingTitle}\n` +
      `Archivo Guardado: ${absolutePath}\n` +
      `Tamaño: ${sizeFormatted} (${sizeBytes.toLocaleString()} bytes)\n` +
      `Origen: ${originType} [${sourceUrl}]\n\n` +
      `✓ Archivo PDF original descargado y guardado exitosamente en disco.`
    );
  },
};
