/**
 * Gestor de almacenamiento local en disco por materia.
 * Organiza archivos originales (.pdf) y texto estructurado (.md) en data/courses/<id> - <nombre>/
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function resolveDefaultCoursesDir(): string {
  let curr = __dirname;
  for (let i = 0; i < 4; i++) {
    if (fs.existsSync(path.join(curr, "package.json"))) {
      try {
        const pkg = JSON.parse(fs.readFileSync(path.join(curr, "package.json"), "utf-8"));
        if (pkg.name === "s21-canvas-mcp") {
          return path.join(curr, "data", "courses");
        }
      } catch {}
    }
    curr = path.dirname(curr);
  }
  return path.resolve(__dirname, "../data/courses");
}

const DEFAULT_COURSES_DIR = resolveDefaultCoursesDir();

export function getCoursesRootDir(): string {
  const root = process.env.S21_COURSES_DIR || DEFAULT_COURSES_DIR;
  if (!fs.existsSync(root)) {
    fs.mkdirSync(root, { recursive: true });
  }
  return root;
}

/**
 * Sanitiza un texto para usarlo de forma segura como nombre de archivo o carpeta en Windows y Linux.
 */
export function sanitizeFileName(name: string): string {
  if (!name) return "sin_nombre";
  return name
    .replace(/[/\\?%*:|"<>]/g, "_")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Resuelve o crea la carpeta de una materia.
 * Si ya existe una carpeta que comienza con "${courseId} -", la reutiliza.
 */
export function getCourseDir(courseId: number, courseName?: string): string {
  const root = getCoursesRootDir();

  // Buscar si ya existe una carpeta para este ID
  try {
    const existingDirs = fs.readdirSync(root, { withFileTypes: true });
    for (const ent of existingDirs) {
      if (ent.isDirectory()) {
        const match = ent.name.match(/^(\d+)(?:\s*-\s*|$)/);
        if (match && Number(match[1]) === courseId) {
          return path.join(root, ent.name);
        }
      }
    }
  } catch {}

  // Si no existe, crear con nombre limpio
  const cleanName = courseName ? sanitizeFileName(courseName) : `Materia_${courseId}`;
  const dirName = `${courseId} - ${cleanName}`;
  const targetPath = path.join(root, dirName);
  if (!fs.existsSync(targetPath)) {
    fs.mkdirSync(targetPath, { recursive: true });
  }
  return targetPath;
}

/**
 * Genera el prefijo y nombre base de una lectura dentro del curso.
 * Ej: "M1_L1_Fundamentos_de_los_lenguajes_formales"
 */
export function getReadingBaseName(moduleNum: number, readingNum: number, title?: string): string {
  const cleanTitle = title ? `_${sanitizeFileName(title)}` : "";
  return `M${moduleNum}_L${readingNum}${cleanTitle}`;
}

export interface LocalReadingData {
  title: string;
  markdown: string;
  mdPath: string;
  pdfPath?: string;
  hasPdf: boolean;
  charCount: number;
}

export interface LocalReadingFiles {
  mdPath?: string;
  pdfPath?: string;
  title: string;
  hasMd: boolean;
  hasPdf: boolean;
}

/**
 * Verifica si una lectura ya está guardada localmente en formato Markdown o PDF.
 */
export function hasReading(courseId: number, moduleNum: number, readingNum: number): boolean {
  return findLocalReadingFiles(courseId, moduleNum, readingNum) !== null;
}

/**
 * Busca las rutas locales de una lectura (MD y PDF) si existen en la carpeta de la materia.
 * Admite archivos .md, .pdf o ambos, con variantes de prefijos habituales (M1_L1, M1-L1, etc.)
 */
export function findLocalReadingFiles(
  courseId: number,
  moduleNum: number,
  readingNum: number
): LocalReadingFiles | null {
  const courseDir = getCourseDir(courseId);
  if (!fs.existsSync(courseDir)) return null;

  try {
    const files = fs.readdirSync(courseDir);
    const prefix1 = `M${moduleNum}_L${readingNum}`;
    const prefix2 = `M${moduleNum}-L${readingNum}`;

    const isMatch = (fileName: string) => {
      const lower = fileName.toLowerCase();
      if (fileName.startsWith(prefix1) || fileName.startsWith(prefix2)) return true;
      // Compatibilidad con "Modulo 1 - Lectura 1" o similar
      const mMatch = lower.match(/m(?:odulo|ódulo)?\s*0?(\d+)/);
      const lMatch = lower.match(/l(?:ectura)?\s*0?(\d+)/);
      if (mMatch && lMatch && Number(mMatch[1]) === moduleNum && Number(lMatch[1]) === readingNum) {
        return true;
      }
      return false;
    };

    // Buscar archivo .md correspondiente
    const mdFile = files.find((f) => isMatch(f) && f.toLowerCase().endsWith(".md"));
    // Buscar archivo .pdf correspondiente
    const pdfFile = files.find((f) => isMatch(f) && f.toLowerCase().endsWith(".pdf"));

    if (!mdFile && !pdfFile) return null;

    const mdPath = mdFile ? path.join(courseDir, mdFile) : undefined;
    const pdfPath = pdfFile ? path.join(courseDir, pdfFile) : undefined;

    // Extraer título limpio a partir del nombre del archivo encontrado
    const representativeName = (mdFile || pdfFile)!;
    let title = representativeName
      .replace(/^M\d+[-_]L\d+[-_]?/i, "")
      .replace(/\.(md|pdf)$/i, "")
      .replace(/_/g, " ")
      .trim();

    if (!title) {
      title = `Módulo ${moduleNum} - Lectura ${readingNum}`;
    }

    return {
      mdPath,
      pdfPath,
      title,
      hasMd: Boolean(mdPath && fs.existsSync(mdPath)),
      hasPdf: Boolean(pdfPath && fs.existsSync(pdfPath)),
    };
  } catch {
    return null;
  }
}

/**
 * Lee el contenido local de una lectura en Markdown y metadatos de PDF si existe.
 */
export function getReading(
  courseId: number,
  moduleNum: number,
  readingNum: number
): LocalReadingData | null {
  const files = findLocalReadingFiles(courseId, moduleNum, readingNum);
  if (!files) return null;

  try {
    let markdown = "";
    if (files.mdPath && fs.existsSync(files.mdPath)) {
      markdown = fs.readFileSync(files.mdPath, "utf-8");
    }
    return {
      title: files.title,
      markdown,
      mdPath: files.mdPath || "",
      pdfPath: files.pdfPath,
      hasPdf: files.hasPdf,
      charCount: markdown.length,
    };
  } catch {
    return null;
  }
}

/**
 * Abre un archivo o carpeta en el visor por defecto del sistema operativo (Windows/macOS/Linux).
 */
export function openPathInSystem(targetPath: string): boolean {
  if (!fs.existsSync(targetPath)) return false;

  // Verificar que la ruta no intente escapar fuera del árbol permitido
  const resolved = path.resolve(targetPath);
  const rootDir = path.resolve(getCoursesRootDir());
  if (!resolved.startsWith(rootDir)) {
    console.warn("[StorageManager] Intento de acceso a ruta no permitida:", targetPath);
    return false;
  }

  const platform = process.platform;
  if (platform === "win32") {
    execFile("cmd.exe", ["/c", "start", "", resolved], (err) => {
      if (err) console.error("[StorageManager] Error al abrir en Windows:", err);
    });
    return true;
  } else if (platform === "darwin") {
    execFile("open", [resolved], (err) => {
      if (err) console.error("[StorageManager] Error al abrir en macOS:", err);
    });
    return true;
  } else {
    execFile("xdg-open", [resolved], (err) => {
      if (err) console.error("[StorageManager] Error al abrir en Linux:", err);
    });
    return true;
  }
}

/**
 * Abre la carpeta de la materia en el explorador de archivos local.
 */
export function openCourseFolder(courseId: number, courseName?: string): boolean {
  const courseDir = getCourseDir(courseId, courseName);
  return openPathInSystem(courseDir);
}

/**
 * Abre el PDF de una lectura específica en el visor PDF del sistema operativo.
 */
export function openReadingPdf(
  courseId: number,
  moduleNum: number,
  readingNum: number
): boolean {
  const files = findLocalReadingFiles(courseId, moduleNum, readingNum);
  if (files && files.pdfPath && fs.existsSync(files.pdfPath)) {
    return openPathInSystem(files.pdfPath);
  }
  return false;
}

/**
 * Guarda una lectura (Markdown y opcionalmente PDF binario) en la carpeta de la materia.
 */
export function saveReading(
  courseId: number,
  moduleNum: number,
  readingNum: number,
  title: string,
  markdown: string,
  pdfBuffer?: Buffer | Uint8Array,
  courseName?: string
): { mdPath: string; pdfPath?: string } {
  const courseDir = getCourseDir(courseId, courseName);
  const baseName = getReadingBaseName(moduleNum, readingNum, title);

  const mdPath = path.join(courseDir, `${baseName}.md`);
  fs.writeFileSync(mdPath, markdown, "utf-8");

  let pdfPath: string | undefined;
  if (pdfBuffer && pdfBuffer.length > 0) {
    pdfPath = path.join(courseDir, `${baseName}.pdf`);
    fs.writeFileSync(pdfPath, Buffer.from(pdfBuffer));
  }

  return { mdPath, pdfPath };
}

/**
 * Guarda un archivo genérico (ej: PDF de tarea, apunte descargado) en la carpeta de la materia.
 */
export function saveCourseFile(
  courseId: number,
  filename: string,
  buffer: Buffer | Uint8Array,
  courseName?: string
): string {
  const courseDir = getCourseDir(courseId, courseName);
  const cleanName = sanitizeFileName(filename);
  const targetPath = path.join(courseDir, cleanName);
  fs.writeFileSync(targetPath, Buffer.from(buffer));
  return targetPath;
}

/**
 * Busca si un archivo específico ya está guardado en la carpeta de la materia.
 */
export function findLocalCourseFile(
  courseId: number,
  filename: string
): string | null {
  const courseDir = getCourseDir(courseId);
  if (!fs.existsSync(courseDir)) return null;

  const cleanName = sanitizeFileName(filename).toLowerCase();
  try {
    const files = fs.readdirSync(courseDir);
    const found = files.find((f) => f.toLowerCase() === cleanName);
    if (found) {
      return path.join(courseDir, found);
    }
  } catch {}

  return null;
}

/**
 * Busca si existe un archivo PDF en cualquier carpeta de materia que coincida con el nombre.
 */
export function findAnyLocalFile(filename: string): string | null {
  const root = getCoursesRootDir();
  const cleanName = sanitizeFileName(filename).toLowerCase();

  try {
    const courseDirs = fs.readdirSync(root, { withFileTypes: true });
    for (const dir of courseDirs) {
      if (dir.isDirectory()) {
        const fullDir = path.join(root, dir.name);
        const files = fs.readdirSync(fullDir);
        const found = files.find((f) => f.toLowerCase() === cleanName);
        if (found) {
          return path.join(fullDir, found);
        }
      }
    }
  } catch {}

  return null;
}
