import pdfParse from "pdf-parse";

export interface PdfExtractResult {
  numPages: number;
  info: any;
  text: string;
  charCount: number;
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
  };
}

/**
 * Descarga un archivo PDF desde una URL con autorización Bearer y extrae su texto.
 */
export async function downloadAndExtractPdf(
  url: string,
  token?: string,
  maxPages?: number
): Promise<PdfExtractResult> {
  const headers: Record<string, string> = {
    "User-Agent": "S21-Canvas-MCP/1.0",
  };
  if (token) {
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
