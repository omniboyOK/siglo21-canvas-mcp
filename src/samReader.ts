/**
 * Retrocompatibilidad: Re-exportación desde la nueva ubicación canónica.
 * @deprecated Usar import from "./content/sam.js"
 */
export {
  extractSamCatalog,
  getCourseSamCatalog,
  fetchAndParseSamReading,
  fetchSamReadingPdf,
  getSamBaseUrl,
  type SamReadingItem,
  type SamReadingContent,
  type SamPdfResult,
} from "./content/sam.js";
