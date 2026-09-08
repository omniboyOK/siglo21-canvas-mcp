/**
 * Descarga y extracción de texto de documentos PDF.
 * @module content/pdf
 */

import pdfParse from "pdf-parse";
import { USER_AGENT } from "../config/constants.js";

export interface PdfExtractResult {
  numPages: number;
  info: any;
  text: string;
  charCount: number;
  buffer?: Buffer;
}

/**
 * Valida que una URL pertenezca al dominio configurado de Canvas LMS
 */
export function isCanvasUrl(url: string, canvasBaseUrl: string): boolean {
  try {
    const parsed = new URL(url);
    const canvasHost = new URL(canvasBaseUrl).hostname.toLowerCase();
    const targetHost = parsed.hostname.toLowerCase();
    return targetHost === canvasHost || targetHost.endsWith(".instructure.com");
  } catch {
    return false;
  }
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

  const data = await pdfParse(buffer, options);

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
 * Descarga un archivo PDF desde una URL con autorización Bearer (solo si es dominio Canvas) y extrae su texto.
 */
export async function downloadAndExtractPdf(
  url: string,
  token?: string,
  maxPages?: number,
  canvasBaseUrl?: string
): Promise<PdfExtractResult> {
  const headers: Record<string, string> = {
    "User-Agent": USER_AGENT,
  };
  const shouldAuth = canvasBaseUrl ? isCanvasUrl(url, canvasBaseUrl) : Boolean(token);
  if (token && shouldAuth) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`Fallo al descargar PDF (HTTP ${response.status}): ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  return extractPdfTextFromBuffer(buffer, maxPages);
}
