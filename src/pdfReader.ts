/**
 * Retrocompatibilidad: Re-exportación desde la nueva ubicación canónica.
 * @deprecated Usar import from "./content/pdf.js"
 */
export {
  downloadAndExtractPdf,
  extractPdfTextFromBuffer,
  isCanvasUrl,
  type PdfExtractResult,
} from "./content/pdf.js";
