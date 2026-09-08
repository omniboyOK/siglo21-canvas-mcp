/**
 * Retrocompatibilidad: Re-exportación desde la nueva ubicación canónica.
 * @deprecated Usar import from "./storage/manager.js"
 */
export {
  getCoursesRootDir,
  sanitizeFileName,
  getCourseDir,
  getReadingBaseName,
  hasReading,
  findLocalReadingFiles,
  getReading,
  openPathInSystem,
  openCourseFolder,
  openReadingPdf,
  saveReading,
  saveCourseFile,
  findLocalCourseFile,
  findAnyLocalFile,
  type LocalReadingData,
  type LocalReadingFiles,
} from "./storage/manager.js";
