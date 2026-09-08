/**
 * Retrocompatibilidad: Re-exportación desde la nueva ubicación canónica.
 * @deprecated Usar import from "./content/sam.js"
 */
export {
  extractSamCatalog,
  getCourseSamCatalog,
  fetchAndParseSamReading,
  type SamReadingItem,
  type SamReadingContent,
} from "./content/sam.js";
