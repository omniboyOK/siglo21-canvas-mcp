/**
 * Generador de simulacros de examen y preguntas de práctica
 * basado en el contenido textual extraído de las lecturas.
 */

export interface PracticeQuizQuestion {
  id: number;
  question: string;
  options: string[];
  correct_option_index: number;
  explanation: string;
  topic: string;
}

export interface PracticeQuiz {
  course_id: number;
  module_number: number;
  reading_number: number;
  title: string;
  source_summary: string;
  suggested_prompt_for_ai: string;
}

export function buildQuizPrompt(
  courseName: string,
  moduleNumber: number,
  readingNumber: number,
  readingTitle: string,
  contentSample: string,
  questionCount = 5
): string {
  return `Actúa como docente universitario de la Universidad Siglo 21 para la materia "${courseName}".
Genera un simulacro de examen tipo API (Actividad Práctica Integrada) de ${questionCount} preguntas de opción múltiple (4 opciones cada una: A, B, C, D) basado estrictamente en el siguiente contenido oficial de la Lectura ${readingNumber} (Módulo ${moduleNumber}: "${readingTitle}").

Requisitos para cada pregunta:
1. Plantea situaciones prácticas o conceptuales rigurosas.
2. Indica claramente la opción correcta.
3. Proporciona una justificación detallada explicando por qué la opción correcta es la adecuada y por qué las demás son incorrectas.

--- CONTENIDO DE LA LECTURA ---
${contentSample}
-------------------------------`;
}
