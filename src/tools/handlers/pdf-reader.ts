import type { ToolDefinition } from "../_base.js";
import { textResponse } from "../_base.js";
import { ReadPdfSchema } from "../schemas.js";
import { getFileInfo } from "../../canvas/content.service.js";

export const pdfReaderTool: ToolDefinition = {
  name: "s21_read_pdf_content",
  description:
    "Descarga en memoria y extrae el texto completo de un PDF de lectura/actividad de Canvas para resumir o estudiar.",
  inputSchema: {
    type: "object",
    properties: {
      file_id: { type: "number", description: "ID numérico del archivo en Canvas (opcional si se pasa download_url)." },
      download_url: { type: "string", description: "URL directa de descarga del archivo en Canvas." },
      max_pages: { type: "number", description: "Número máximo de páginas a leer (opcional)." },
    },
  },
  requiresAuth: true,
  handler: async (args, ctx) => {
    const parsed = ReadPdfSchema.parse(args);
    let downloadUrl = parsed.download_url;

    if (!downloadUrl && parsed.file_id) {
      const fileInfo = await getFileInfo(ctx.client, parsed.file_id);
      downloadUrl = fileInfo.url || fileInfo.download_url;
    }

    if (!downloadUrl) {
      throw new Error("Debes proporcionar 'file_id' o 'download_url'");
    }

    const extract = await ctx.client.downloadPdf(downloadUrl, parsed.max_pages);
    return textResponse(
      `=== Contenido del Documento PDF ===\nPáginas: ${extract.numPages}\nCaracteres: ${extract.charCount}\n\n${extract.text}`
    );
  },
};
