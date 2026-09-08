import { describe, it, before, after } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  sanitizeFileName,
  getCourseDir,
  saveReading,
  hasReading,
  getReading,
  saveCourseFile,
  findLocalCourseFile,
  findAnyLocalFile,
} from "./storageManager.js";

describe("storageManager - Almacenamiento local por materia", () => {
  const tempRootDir = path.join(os.tmpdir(), `s21-test-courses-${Date.now()}`);
  const originalEnv = process.env.S21_COURSES_DIR;

  before(() => {
    process.env.S21_COURSES_DIR = tempRootDir;
  });

  after(() => {
    if (originalEnv !== undefined) {
      process.env.S21_COURSES_DIR = originalEnv;
    } else {
      delete process.env.S21_COURSES_DIR;
    }
    if (fs.existsSync(tempRootDir)) {
      fs.rmSync(tempRootDir, { recursive: true, force: true });
    }
  });

  it("sanitizeFileName debe eliminar caracteres no permitidos en el sistema de archivos", () => {
    const raw = 'Materia: Algoritmos / Sistemas? * <test> | "demo"';
    const clean = sanitizeFileName(raw);
    assert.strictEqual(clean.includes(":"), false);
    assert.strictEqual(clean.includes("/"), false);
    assert.strictEqual(clean.includes("?"), false);
    assert.strictEqual(clean.includes("*"), false);
    assert.strictEqual(clean.includes("<"), false);
    assert.strictEqual(clean.includes(">"), false);
    assert.strictEqual(clean.includes("|"), false);
    assert.strictEqual(clean.includes('"'), false);
  });

  it("getCourseDir debe crear y reutilizar la carpeta del curso según ID y nombre", () => {
    const dir = getCourseDir(99999, "Materia de Prueba - 2026");
    assert.ok(fs.existsSync(dir));
    assert.ok(path.basename(dir).startsWith("99999 - "));

    // Reutilización aunque no se proporcione el nombre completo la segunda vez
    const dirReuse = getCourseDir(99999);
    assert.strictEqual(dir, dirReuse);
  });

  it("saveReading y getReading deben persistir y recuperar Markdown y PDF", () => {
    const courseId = 88888;
    const courseName = "Sistemas Operativos";
    const moduleNum = 2;
    const readingNum = 3;
    const title = "Procesos e Hilos";
    const markdown = "# Procesos e Hilos\nContenido de prueba en markdown.";
    const fakePdfBuffer = Buffer.from("%PDF-1.4 test binary");

    assert.strictEqual(hasReading(courseId, moduleNum, readingNum), false);

    const saved = saveReading(
      courseId,
      moduleNum,
      readingNum,
      title,
      markdown,
      fakePdfBuffer,
      courseName
    );

    assert.ok(fs.existsSync(saved.mdPath));
    assert.ok(saved.pdfPath && fs.existsSync(saved.pdfPath));

    // Verificar que hasReading detecte los archivos
    assert.strictEqual(hasReading(courseId, moduleNum, readingNum), true);

    // Recuperar contenido
    const loaded = getReading(courseId, moduleNum, readingNum);
    assert.ok(loaded);
    assert.strictEqual(loaded?.markdown, markdown);
    assert.strictEqual(loaded?.hasPdf, true);
  });

  it("saveCourseFile y findLocalCourseFile deben gestionar archivos adjuntos y descargas", () => {
    const courseId = 88888;
    const filename = "consigna_tp1.pdf";
    const buffer = Buffer.from("dummy pdf content");

    const savedPath = saveCourseFile(courseId, filename, buffer);
    assert.ok(fs.existsSync(savedPath));

    const found = findLocalCourseFile(courseId, filename);
    assert.strictEqual(found, savedPath);

    // Búsqueda insensible a mayúsculas
    const foundCase = findLocalCourseFile(courseId, "CONSIGNA_TP1.PDF");
    assert.strictEqual(foundCase, savedPath);

    // Búsqueda global findAnyLocalFile
    const anyFound = findAnyLocalFile(filename);
    assert.strictEqual(anyFound, savedPath);
  });

  it("findLocalReadingFiles debe detectar lecturas con solo PDF sin requerir Markdown", () => {
    const courseId = 77777;
    const courseDir = getCourseDir(courseId, "Redes y Telecomunicaciones");
    const pdfOnlyFile = path.join(courseDir, "M3_L1_Protocolos_TCP_IP.pdf");
    fs.writeFileSync(pdfOnlyFile, "%PDF-1.4 solo pdf");

    const found = hasReading(courseId, 3, 1);
    assert.strictEqual(found, true);

    const reading = getReading(courseId, 3, 1);
    assert.ok(reading);
    assert.strictEqual(reading?.hasPdf, true);
    assert.strictEqual(reading?.title, "Protocolos TCP IP");
  });
});
