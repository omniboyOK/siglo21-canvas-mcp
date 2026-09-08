/**
 * Utilidades de formateo de datos de cursos Canvas.
 */

import { cleanHtmlToMarkdown } from "../content/html.js";

/**
 * Limpia el nombre de la materia removiendo cadenas de fechas redundantes.
 * Ej: "ALGORITMOS Y ESTRUCTURA DE DATOS I 04-AUG-2025 04-OCT-2025" -> "ALGORITMOS Y ESTRUCTURA DE DATOS I"
 */
export function cleanCourseTitle(rawName: string): string {
  if (!rawName) return "";
  return rawName
    .replace(/\s+\d{1,2}-[A-Z]{3}-\d{4}\s+\d{1,2}-[A-Z]{3}-\d{4}/gi, "")
    .trim();
}

/**
 * Extrae el rango legible de fechas de cursada del nombre o inicio/fin.
 */
export function extractCourseDates(rawName: string): string | null {
  if (!rawName) return null;
  const m = rawName.match(
    /(\d{1,2}-[A-Z]{3}-\d{4})\s+(\d{1,2}-[A-Z]{3}-\d{4})/i
  );
  if (m) {
    return `${m[1]} al ${m[2]}`;
  }
  return null;
}

/**
 * Determina el año del curso a partir del nombre, término o fecha de inicio.
 */
export function extractCourseYear(course: {
  name: string;
  term_name?: string;
  start_at?: string | null;
}): string {
  const m = course.name.match(/202\d/);
  if (m) return m[0];
  if (course.term_name) {
    const tm = course.term_name.match(/202\d/);
    if (tm) return tm[0];
    const slashM = course.term_name.match(/\/(\d{2})/);
    if (slashM) return `20${slashM[1]}`;
  }
  if (course.start_at) {
    return course.start_at.substring(0, 4);
  }
  return "2025";
}

// Re-export cleanHtmlToMarkdown for convenience in canvas services
export { cleanHtmlToMarkdown };
