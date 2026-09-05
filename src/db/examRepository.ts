import { getDb } from "./database.js";

export interface QuestionInput {
  module_number: number;
  reading_number?: number;
  topic?: string;
  question_text: string;
  options: string[];
  correct_option_index: number;
  explanation: string;
  difficulty?: "easy" | "medium" | "hard";
}

export interface QuestionRecord {
  id: number;
  course_id: number;
  module_number: number;
  reading_number: number | null;
  topic: string | null;
  question_text: string;
  options: string[];
  correct_option_index: number;
  explanation: string;
  difficulty: string;
  created_at: string;
}

export interface PublicQuestion {
  id: number;
  module_number: number;
  reading_number: number | null;
  topic: string | null;
  question_text: string;
  options: string[];
}

export interface CourseSummary {
  id: number;
  name: string;
  code: string | null;
  question_count: number;
  attempts_count: number;
  avg_score: number | null;
  modules: number[];
}

export interface ExamAttemptRecord {
  id: number;
  course_id: number;
  course_name?: string;
  attempt_number: number;
  title: string;
  mode: "exam" | "practice";
  total_questions: number;
  score: number;
  passed: boolean;
  time_spent_seconds: number;
  started_at: string;
  completed_at: string | null;
}

export interface DetailedAnswerResult {
  question_id: number;
  question_text: string;
  module_number: number;
  reading_number: number | null;
  topic: string | null;
  options: string[];
  selected_option_index: number | null;
  correct_option_index: number;
  is_correct: boolean;
  explanation: string;
}

export interface DetailedAttemptResult {
  attempt: ExamAttemptRecord;
  answers: DetailedAnswerResult[];
}

export class ExamRepository {
  /**
   * Registra o actualiza una materia.
   */
  static upsertCourse(course: { id: number; name: string; code?: string }): void {
    const db = getDb();
    const stmt = db.prepare(`
      INSERT INTO courses (id, name, code, updated_at)
      VALUES (?, ?, ?, datetime('now', 'localtime'))
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        code = COALESCE(excluded.code, courses.code),
        updated_at = datetime('now', 'localtime');
    `);
    stmt.run(course.id, course.name, course.code || null);
  }

  /**
   * Guarda un lote de preguntas asociadas a una materia.
   */
  static saveQuestions(
    courseId: number,
    courseName: string,
    questions: QuestionInput[]
  ): { insertedCount: number } {
    const db = getDb();

    // Asegurar que la materia existe
    this.upsertCourse({ id: courseId, name: courseName });

    const insertStmt = db.prepare(`
      INSERT INTO questions (
        course_id, module_number, reading_number, topic,
        question_text, options_json, correct_option_index, explanation, difficulty
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    let count = 0;
    for (const q of questions) {
      if (!q.question_text || !Array.isArray(q.options) || q.options.length < 2) {
        continue;
      }
      insertStmt.run(
        courseId,
        q.module_number || 1,
        q.reading_number ?? null,
        q.topic ?? null,
        q.question_text.trim(),
        JSON.stringify(q.options),
        q.correct_option_index,
        q.explanation ? q.explanation.trim() : "",
        q.difficulty || "medium"
      );
      count++;
    }

    return { insertedCount: count };
  }

  /**
   * Retorna el resumen de materias registradas con cantidad de preguntas e historial.
   */
  static getCoursesSummary(): CourseSummary[] {
    const db = getDb();

    const stmt = db.prepare(`
      SELECT 
        c.id, 
        c.name, 
        c.code,
        COUNT(DISTINCT q.id) as question_count,
        COUNT(DISTINCT a.id) as attempts_count,
        ROUND(AVG(CASE WHEN a.completed_at IS NOT NULL THEN a.score END), 2) as avg_score
      FROM courses c
      LEFT JOIN questions q ON c.id = q.course_id
      LEFT JOIN exam_attempts a ON c.id = a.course_id
      GROUP BY c.id, c.name, c.code
      ORDER BY c.name ASC;
    `);

    const rows = stmt.all() as any[];

    // Obtener módulos disponibles por materia
    const modStmt = db.prepare(`
      SELECT DISTINCT course_id, module_number 
      FROM questions 
      ORDER BY module_number ASC;
    `);
    const modRows = modStmt.all() as any[];
    const modulesByCourse: Record<number, number[]> = {};
    for (const r of modRows) {
      if (!modulesByCourse[r.course_id]) modulesByCourse[r.course_id] = [];
      modulesByCourse[r.course_id].push(r.module_number);
    }

    return rows.map((r) => ({
      id: Number(r.id),
      name: String(r.name),
      code: r.code ? String(r.code) : null,
      question_count: Number(r.question_count || 0),
      attempts_count: Number(r.attempts_count || 0),
      avg_score: r.avg_score != null ? Number(r.avg_score) : null,
      modules: modulesByCourse[r.id] || [],
    }));
  }

  /**
   * Retorna preguntas completas de una materia (para inspección o edición).
   */
  static getQuestions(courseId: number, moduleNumber?: number, limit?: number): QuestionRecord[] {
    const db = getDb();
    let query = `SELECT * FROM questions WHERE course_id = ?`;
    const params: any[] = [courseId];

    if (moduleNumber) {
      query += ` AND module_number = ?`;
      params.push(moduleNumber);
    }
    query += ` ORDER BY module_number ASC, id ASC`;

    if (limit && limit > 0) {
      query += ` LIMIT ?`;
      params.push(limit);
    }
    query += `;`;

    const stmt = db.prepare(query);
    const rows = stmt.all(...params) as any[];

    return rows.map((r) => ({
      id: Number(r.id),
      course_id: Number(r.course_id),
      module_number: Number(r.module_number),
      reading_number: r.reading_number != null ? Number(r.reading_number) : null,
      topic: r.topic ? String(r.topic) : null,
      question_text: String(r.question_text),
      options: JSON.parse(r.options_json || "[]"),
      correct_option_index: Number(r.correct_option_index),
      explanation: String(r.explanation || ""),
      difficulty: String(r.difficulty || "medium"),
      created_at: String(r.created_at),
    }));
  }

  /**
   * Elimina una pregunta del banco.
   */
  static deleteQuestion(questionId: number): boolean {
    const db = getDb();
    const stmt = db.prepare(`DELETE FROM questions WHERE id = ?`);
    const res = stmt.run(questionId);
    return res.changes > 0;
  }

  /**
   * Genera un examen aleatorio para un alumno, crea el intento en estado borrador
   * y entrega las preguntas sin revelar las respuestas correctas.
   */
  static generateRandomExam(
    courseId: number,
    options: {
      modules?: number[];
      count?: number;
      mode?: "exam" | "practice";
      title?: string;
    } = {}
  ): { attempt: ExamAttemptRecord; questions: PublicQuestion[] } {
    const db = getDb();

    // 1. Obtener siguiente número de intento
    const countStmt = db.prepare(`
      SELECT COUNT(*) as total FROM exam_attempts WHERE course_id = ?;
    `);
    const countRes = countStmt.get(courseId) as any;
    const attemptNumber = Number(countRes?.total || 0) + 1;

    // 2. Filtrar preguntas aleatorias
    let sql = `SELECT id, module_number, reading_number, topic, question_text, options_json 
               FROM questions WHERE course_id = ?`;
    const params: any[] = [courseId];

    if (options.modules && options.modules.length > 0) {
      const placeholders = options.modules.map(() => "?").join(",");
      sql += ` AND module_number IN (${placeholders})`;
      params.push(...options.modules);
    }

    const limit = options.count && options.count > 0 ? options.count : 10;
    sql += ` ORDER BY RANDOM() LIMIT ?;`;
    params.push(limit);

    const questionsStmt = db.prepare(sql);
    const questionRows = questionsStmt.all(...params) as any[];

    if (questionRows.length === 0) {
      throw new Error(`No hay preguntas disponibles en el banco para la materia ${courseId} con los filtros seleccionados.`);
    }

    const totalQuestions = questionRows.length;
    const mode = options.mode || "exam";
    const defaultTitle = options.title || `Simulacro #${attemptNumber} (${totalQuestions} preguntas)`;

    // 3. Crear el registro del intento
    const insertAttempt = db.prepare(`
      INSERT INTO exam_attempts (
        course_id, attempt_number, title, mode, total_questions, score, passed, started_at
      ) VALUES (?, ?, ?, ?, ?, 0, 0, datetime('now', 'localtime'));
    `);
    const insertRes = insertAttempt.run(
      courseId,
      attemptNumber,
      defaultTitle,
      mode,
      totalQuestions
    );
    const attemptId = Number(insertRes.lastInsertRowid);

    // 4. Pre-insertar las filas en attempt_answers vinculadas a este intento
    const insertAnswer = db.prepare(`
      INSERT INTO attempt_answers (attempt_id, question_id, selected_option_index, is_correct)
      VALUES (?, ?, NULL, 0);
    `);
    for (const q of questionRows) {
      insertAnswer.run(attemptId, q.id);
    }

    const attempt: ExamAttemptRecord = {
      id: attemptId,
      course_id: courseId,
      attempt_number: attemptNumber,
      title: defaultTitle,
      mode,
      total_questions: totalQuestions,
      score: 0,
      passed: false,
      time_spent_seconds: 0,
      started_at: new Date().toISOString(),
      completed_at: null,
    };

    const publicQuestions: PublicQuestion[] = questionRows.map((r) => ({
      id: Number(r.id),
      module_number: Number(r.module_number),
      reading_number: r.reading_number != null ? Number(r.reading_number) : null,
      topic: r.topic ? String(r.topic) : null,
      question_text: String(r.question_text),
      options: JSON.parse(r.options_json || "[]"),
    }));

    return { attempt, questions: publicQuestions };
  }

  /**
   * Recibe las respuestas del alumno, calcula la nota en escala 1-10 Siglo 21,
   * actualiza la base de datos y entrega el desglose detallado con justificaciones.
   */
  static submitExamAttempt(
    attemptId: number,
    timeSpentSeconds: number,
    answers: { question_id: number; selected_option_index: number | null }[]
  ): {
    attempt: ExamAttemptRecord;
    score: number;
    passed: boolean;
    promoted: boolean;
    correctCount: number;
    totalCount: number;
    results: DetailedAnswerResult[];
  } {
    const db = getDb();

    // 1. Obtener intento
    const getAttempt = db.prepare(`SELECT * FROM exam_attempts WHERE id = ?;`);
    const attemptRow = getAttempt.get(attemptId) as any;
    if (!attemptRow) {
      throw new Error(`El intento #${attemptId} no existe.`);
    }

    // 2. Obtener preguntas asignadas al intento
    const getQuestions = db.prepare(`
      SELECT 
        q.id, q.question_text, q.module_number, q.reading_number, q.topic,
        q.options_json, q.correct_option_index, q.explanation
      FROM attempt_answers aa
      JOIN questions q ON aa.question_id = q.id
      WHERE aa.attempt_id = ?;
    `);
    const assignedQuestions = getQuestions.all(attemptId) as any[];

    const answerMap = new Map<number, number | null>();
    for (const a of answers) {
      answerMap.set(a.question_id, a.selected_option_index);
    }

    const updateAnswer = db.prepare(`
      UPDATE attempt_answers 
      SET selected_option_index = ?, is_correct = ?, answered_at = datetime('now', 'localtime')
      WHERE attempt_id = ? AND question_id = ?;
    `);

    let correctCount = 0;
    const totalCount = assignedQuestions.length;
    const results: DetailedAnswerResult[] = [];

    for (const q of assignedQuestions) {
      const selected = answerMap.has(q.id) ? answerMap.get(q.id)! : null;
      const isCorrect = selected !== null && Number(selected) === Number(q.correct_option_index);

      if (isCorrect) correctCount++;

      updateAnswer.run(selected, isCorrect ? 1 : 0, attemptId, q.id);

      results.push({
        question_id: Number(q.id),
        question_text: String(q.question_text),
        module_number: Number(q.module_number),
        reading_number: q.reading_number != null ? Number(q.reading_number) : null,
        topic: q.topic ? String(q.topic) : null,
        options: JSON.parse(q.options_json || "[]"),
        selected_option_index: selected,
        correct_option_index: Number(q.correct_option_index),
        is_correct: isCorrect,
        explanation: String(q.explanation || ""),
      });
    }

    // Nota en escala 1 a 10 Siglo 21
    const rawScore = totalCount > 0 ? (correctCount / totalCount) * 10 : 0;
    const score = Math.round(rawScore * 10) / 10;
    const passed = score >= 5.0;     // Regularidad en Siglo 21
    const promoted = score >= 7.0;   // Promoción directa

    // 3. Finalizar intento
    const finalizeAttempt = db.prepare(`
      UPDATE exam_attempts 
      SET score = ?, passed = ?, time_spent_seconds = ?, completed_at = datetime('now', 'localtime')
      WHERE id = ?;
    `);
    finalizeAttempt.run(score, passed ? 1 : 0, timeSpentSeconds, attemptId);

    const updatedAttempt: ExamAttemptRecord = {
      id: attemptId,
      course_id: Number(attemptRow.course_id),
      attempt_number: Number(attemptRow.attempt_number),
      title: String(attemptRow.title),
      mode: attemptRow.mode,
      total_questions: totalCount,
      score,
      passed,
      time_spent_seconds: timeSpentSeconds,
      started_at: String(attemptRow.started_at),
      completed_at: new Date().toISOString(),
    };

    return {
      attempt: updatedAttempt,
      score,
      passed,
      promoted,
      correctCount,
      totalCount,
      results,
    };
  }

  /**
   * Obtiene los detalles y respuestas de un intento completado.
   */
  static getAttemptDetails(attemptId: number): DetailedAttemptResult | null {
    const db = getDb();
    const getAttempt = db.prepare(`
      SELECT a.*, c.name as course_name 
      FROM exam_attempts a
      JOIN courses c ON a.course_id = c.id
      WHERE a.id = ?;
    `);
    const attemptRow = getAttempt.get(attemptId) as any;
    if (!attemptRow) return null;

    const getAnswers = db.prepare(`
      SELECT 
        q.id as question_id, q.question_text, q.module_number, q.reading_number, q.topic,
        q.options_json, q.correct_option_index, q.explanation,
        aa.selected_option_index, aa.is_correct
      FROM attempt_answers aa
      JOIN questions q ON aa.question_id = q.id
      WHERE aa.attempt_id = ?
      ORDER BY aa.id ASC;
    `);
    const answerRows = getAnswers.all(attemptId) as any[];

    const answers: DetailedAnswerResult[] = answerRows.map((r) => ({
      question_id: Number(r.question_id),
      question_text: String(r.question_text),
      module_number: Number(r.module_number),
      reading_number: r.reading_number != null ? Number(r.reading_number) : null,
      topic: r.topic ? String(r.topic) : null,
      options: JSON.parse(r.options_json || "[]"),
      selected_option_index: r.selected_option_index != null ? Number(r.selected_option_index) : null,
      correct_option_index: Number(r.correct_option_index),
      is_correct: Boolean(r.is_correct),
      explanation: String(r.explanation || ""),
    }));

    return {
      attempt: {
        id: Number(attemptRow.id),
        course_id: Number(attemptRow.course_id),
        course_name: String(attemptRow.course_name),
        attempt_number: Number(attemptRow.attempt_number),
        title: String(attemptRow.title),
        mode: attemptRow.mode,
        total_questions: Number(attemptRow.total_questions),
        score: Number(attemptRow.score),
        passed: Boolean(attemptRow.passed),
        time_spent_seconds: Number(attemptRow.time_spent_seconds),
        started_at: String(attemptRow.started_at),
        completed_at: attemptRow.completed_at ? String(attemptRow.completed_at) : null,
      },
      answers,
    };
  }

  /**
   * Obtiene el historial de intentos de una materia.
   */
  static getCourseHistory(courseId: number): ExamAttemptRecord[] {
    const db = getDb();
    const stmt = db.prepare(`
      SELECT * FROM exam_attempts 
      WHERE course_id = ? AND completed_at IS NOT NULL
      ORDER BY id DESC;
    `);
    const rows = stmt.all(courseId) as any[];

    return rows.map((r) => ({
      id: Number(r.id),
      course_id: Number(r.course_id),
      attempt_number: Number(r.attempt_number),
      title: String(r.title),
      mode: r.mode,
      total_questions: Number(r.total_questions),
      score: Number(r.score),
      passed: Boolean(r.passed),
      time_spent_seconds: Number(r.time_spent_seconds),
      started_at: String(r.started_at),
      completed_at: String(r.completed_at),
    }));
  }

  /**
   * Elimina un intento del historial.
   */
  static deleteAttempt(attemptId: number): boolean {
    const db = getDb();
    const stmt = db.prepare(`DELETE FROM exam_attempts WHERE id = ?`);
    const res = stmt.run(attemptId);
    return res.changes > 0;
  }
}
