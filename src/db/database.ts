import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_DATA_DIR = path.resolve(__dirname, "../../data");

let dbInstance: DatabaseSync | null = null;
let currentDbPath: string | null = null;

export function getDbPath(): string {
  return process.env.S21_DB_PATH || path.join(DEFAULT_DATA_DIR, "exams.db");
}

export function getDb(): DatabaseSync {
  const targetPath = getDbPath();

  if (dbInstance && currentDbPath === targetPath) {
    return dbInstance;
  }

  // Si cambió la ruta o se reinicializa, cerramos la instancia anterior
  if (dbInstance) {
    try {
      dbInstance.close();
    } catch {}
    dbInstance = null;
  }

  if (targetPath !== ":memory:") {
    const dir = path.dirname(targetPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  const db = new DatabaseSync(targetPath);

  // Optimizaciones de rendimiento e integridad
  if (targetPath !== ":memory:") {
    db.exec("PRAGMA journal_mode = WAL;");
  }
  db.exec("PRAGMA foreign_keys = ON;");

  initSchema(db);

  dbInstance = db;
  currentDbPath = targetPath;
  return dbInstance;
}

function initSchema(db: DatabaseSync): void {
  db.exec(`
    -- 1. Tabla de materias registradas
    CREATE TABLE IF NOT EXISTS courses (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      code TEXT,
      updated_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    -- 2. Banco de preguntas
    CREATE TABLE IF NOT EXISTS questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      course_id INTEGER NOT NULL,
      module_number INTEGER NOT NULL,
      reading_number INTEGER,
      topic TEXT,
      question_text TEXT NOT NULL,
      options_json TEXT NOT NULL,
      correct_option_index INTEGER NOT NULL,
      explanation TEXT NOT NULL,
      difficulty TEXT DEFAULT 'medium',
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_questions_course_module 
    ON questions(course_id, module_number);

    -- 3. Intentos de examen realizados
    CREATE TABLE IF NOT EXISTS exam_attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      course_id INTEGER NOT NULL,
      attempt_number INTEGER NOT NULL,
      title TEXT NOT NULL,
      mode TEXT DEFAULT 'exam',
      total_questions INTEGER NOT NULL,
      score REAL DEFAULT 0,
      passed BOOLEAN DEFAULT 0,
      time_spent_seconds INTEGER DEFAULT 0,
      started_at TEXT DEFAULT (datetime('now', 'localtime')),
      completed_at TEXT,
      FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE CASCADE
    );

    -- 4. Respuestas individuales por intento
    CREATE TABLE IF NOT EXISTS attempt_answers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      attempt_id INTEGER NOT NULL,
      question_id INTEGER NOT NULL,
      selected_option_index INTEGER,
      is_correct BOOLEAN DEFAULT 0,
      answered_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY(attempt_id) REFERENCES exam_attempts(id) ON DELETE CASCADE,
      FOREIGN KEY(question_id) REFERENCES questions(id)
    );

    CREATE INDEX IF NOT EXISTS idx_attempt_answers_attempt 
    ON attempt_answers(attempt_id);
  `);
}

export function closeDb(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
    currentDbPath = null;
  }
}
