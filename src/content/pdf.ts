/**
 * Descarga y extracción de texto de documentos PDF.
 * @module content/pdf
 */

import pdfParse from "pdf-parse";
import { USER_AGENT } from "../config/constants.js";
import { isCanvasUrl, safeFetch } from "../config/httpSecurity.js";

export { isCanvasUrl };

export interface PdfExtractResult {
  numPages: number;
  info: any;
  text: string;
  charCount: number;
  buffer?: Buffer;
}

/**
 * Descarga y extrae el texto de un PDF en memoria sin guardarlo en disco.
 */
export async function extractPdfTextFromBuffer(
  buffer: Buffer,
  maxPages?: number
): Promise<PdfExtractResult> {
  const options: any = {};
  if (maxPages && maxPages > 0) {
    options.max = maxPages;
  }

  const data = await pdfParse(new Uint8Array(buffer) as unknown as Buffer, options);

  // Limpiar espacios en blanco excesivos pero conservar saltos de párrafo
  const cleanText = data.text
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return {
    numPages: data.numpages,
    info: data.info,
    text: cleanText,
    charCount: cleanText.length,
    buffer,
  };
}

/**
 * Descarga un archivo PDF desde una URL con autorización Bearer o cabeceras de sesión (solo si es dominio Canvas) y extrae su texto.
 */
export async function downloadAndExtractPdf(
  url: string,
  tokenOrHeaders?: string | Record<string, string>,
  maxPages?: number,
  canvasBaseUrl?: string
): Promise<PdfExtractResult> {
  const headers: Record<string, string> = {
    "User-Agent": USER_AGENT,
  };
  const shouldAuth = canvasBaseUrl ? isCanvasUrl(url, canvasBaseUrl) : Boolean(tokenOrHeaders);
  if (tokenOrHeaders && shouldAuth) {
    if (typeof tokenOrHeaders === "string") {
      headers["Authorization"] = `Bearer ${tokenOrHeaders}`;
    } else {
      Object.assign(headers, tokenOrHeaders);
    }
  }

  const response = await safeFetch(url, {
    headers,
    authBaseUrl: canvasBaseUrl,
  });
  if (!response.ok) {
    throw new Error(`Fallo al descargar PDF (HTTP ${response.status}): ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  return extractPdfTextFromBuffer(buffer, maxPages);
}
