import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { URL } from "node:url";

import { ExamRepository } from "../db/examRepository.js";
import { getDb } from "../db/database.js";

const ISOLATED_ENV_KEYS = [
  "CANVAS_TOKEN",
  "CANVAS_SESSION",
  "CANVAS_COOKIE",
  "CANVAS_CSRF_TOKEN",
  "CANVAS_URL",
  "S21_DB_PATH",
  "S21_COURSES_DIR",
  "S21_DISABLE_CONFIG_FALLBACK",
  "NODE_ENV",
] as const;

describe("Micro-Router REST API (/api/*)", () => {
  let server: http.Server;
  let baseUrl: string;
  let tempCoursesDir: string;
  let handleApiRequest: typeof import("./apiRouter.js").handleApiRequest;
  const savedEnv = new Map<string, string | undefined>();

  before(async () => {
    for (const key of ISOLATED_ENV_KEYS) {
      savedEnv.set(key, process.env[key]);
    }
    for (const key of [
      "CANVAS_TOKEN",
      "CANVAS_SESSION",
      "CANVAS_COOKIE",
      "CANVAS_CSRF_TOKEN",
      "CANVAS_URL",
    ]) {
      delete process.env[key];
    }

    tempCoursesDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "s21-api-test-courses-")
    );
    process.env.S21_DB_PATH = ":memory:";
    process.env.S21_COURSES_DIR = tempCoursesDir;
    process.env.S21_DISABLE_CONFIG_FALLBACK = "1";
    process.env.NODE_ENV = "test";

    const apiRouter = await import("./apiRouter.js");
    handleApiRequest = apiRouter.handleApiRequest;
    apiRouter.setCanvasClient(null);

    // Inicializar base de datos en memoria
    getDb();

    // Crear servidor HTTP de prueba en puerto efímero (puerto 0)
    server = http.createServer(async (req, res) => {
      try {
        const reqUrl = new URL(req.url || "/", `http://127.0.0.1`);
        const handled = await handleApiRequest(req, res, reqUrl);
        if (!handled) {
          res.writeHead(404, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: "Not found" }));
        }
      } catch (err: any) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    });

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        const addr = server.address() as any;
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  after(() => {
    server.close();
    for (const key of ISOLATED_ENV_KEYS) {
      const value = savedEnv.get(key);
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    if (tempCoursesDir && fs.existsSync(tempCoursesDir)) {
      fs.rmSync(tempCoursesDir, { recursive: true, force: true });
    }
  });

  it("GET /api/tools debe retornar el catálogo de herramientas con ok: true", async () => {
    const res = await fetch(`${baseUrl}/api/tools`);
    assert.strictEqual(res.status, 200);

    const json = (await res.json()) as any;
    assert.strictEqual(json.ok, true);
    assert.ok(Array.isArray(json.data));
    assert.ok(json.data.length >= 10);
  });

  it("GET /api/courses debe responder lista de materias", async () => {
    // Insertamos materia de prueba
    ExamRepository.upsertCourse({ id: 8888, name: "Materia API Test" });

    const res = await fetch(`${baseUrl}/api/courses`);
    assert.strictEqual(res.status, 200);

    const json = (await res.json()) as any;
    assert.strictEqual(json.ok, true);
    assert.ok(Array.isArray(json.data));
    assert.ok(json.data.some((c: any) => c.id === 8888));
  });

  it("POST /api/questions y GET /api/questions deben guardar y devolver preguntas", async () => {
    const payload = {
      course_id: 8888,
      course_name: "Materia API Test",
      questions: [
        {
          module_number: 1,
          question_text: "¿Pregunta de prueba API?",
          options: ["Sí", "No"],
          correct_option_index: 0,
          explanation: "Justificación de prueba",
        },
      ],
    };

    const postRes = await fetch(`${baseUrl}/api/questions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    assert.strictEqual(postRes.status, 200);
    const postJson = (await postRes.json()) as any;
    assert.strictEqual(postJson.ok, true);

    // Consultamos por GET
    const getRes = await fetch(`${baseUrl}/api/questions?course_id=8888`);
    assert.strictEqual(getRes.status, 200);
    const getJson = (await getRes.json()) as any;
    assert.strictEqual(getJson.ok, true);
    assert.strictEqual(getJson.data.length, 1);
    assert.strictEqual(getJson.data[0].question_text, "¿Pregunta de prueba API?");
  });

  it("POST /api/exams/generate debe fallar con 400 si falta course_id", async () => {
    const res = await fetch(`${baseUrl}/api/exams/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.strictEqual(res.status, 400);
    const json = (await res.json()) as any;
    assert.strictEqual(json.ok, false);
  });

  it("GET /api/history debe responder con 400 si falta course_id", async () => {
    const res = await fetch(`${baseUrl}/api/history`);
    assert.strictEqual(res.status, 400);
    const json = (await res.json()) as any;
    assert.strictEqual(json.ok, false);
  });

  it("GET /api/canvas/proxy-download debe responder con 400 si falta url", async () => {
    const res = await fetch(`${baseUrl}/api/canvas/proxy-download`);
    assert.strictEqual(res.status, 400);
    const json = (await res.json()) as any;
    assert.strictEqual(json.ok, false);
    assert.match(json.error, /url es requerido/);
  });

  it("GET /api/canvas/proxy-download debe responder con 403 si la URL no es del dominio de Canvas (SSRF)", async () => {
    const res = await fetch(`${baseUrl}/api/canvas/proxy-download?url=https://evil.com/steal-token`);
    assert.strictEqual(res.status, 403);
    const json = (await res.json()) as any;
    assert.strictEqual(json.ok, false);
    assert.match(json.error, /dominio oficial de Canvas/);
  });

  it("GET /api/canvas/courses/12345/modules debe responder 503 sin credenciales configuradas", async () => {
    const res = await fetch(`${baseUrl}/api/canvas/courses/12345/modules`);
    assert.strictEqual(res.status, 503);
    const json = (await res.json()) as any;
    assert.strictEqual(json.ok, false);
  });

  it("POST /api/storage/open-folder debe validar course_id obligatorio", async () => {
    const res = await fetch(`${baseUrl}/api/storage/open-folder`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.strictEqual(res.status, 400);
    const json = (await res.json()) as any;
    assert.strictEqual(json.ok, false);
    assert.match(json.error, /course_id es requerido/);
  });

  function buildMinimalPdf(text: string): Buffer {
    const safe = text.replace(/[()\\]/g, "\\$&");
    const stream = `BT /F1 12 Tf 72 720 Td (${safe}) Tj ET`;
    const objs = [
      "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
      "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
      "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n",
      `4 0 obj\n<< /Length ${Buffer.byteLength(stream, "ascii")} >>\nstream\n${stream}\nendstream\nendobj\n`,
      "5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
    ];
    let out = "%PDF-1.4\n";
    const offsets: number[] = [];
    for (const obj of objs) {
      offsets.push(Buffer.byteLength(out, "ascii"));
      out += obj;
    }
    const xrefStart = Buffer.byteLength(out, "ascii");
    out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
    for (const off of offsets) {
      out += `${String(off).padStart(10, "0")} 00000 n \n`;
    }
    out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
    return Buffer.from(out, "ascii");
  }

  it("GET /api/canvas/courses/9999/readings-catalog no debe crear carpetas vacías al consultar y debe detectar PDFs existentes", async () => {
    const resEmpty = await fetch(`${baseUrl}/api/canvas/courses/9999/readings-catalog`);
    assert.strictEqual(resEmpty.status, 200);
    const jsonEmpty = (await resEmpty.json()) as any;
    assert.strictEqual(jsonEmpty.ok, true);
    assert.ok(Array.isArray(jsonEmpty.data));
    assert.strictEqual(jsonEmpty.data.length, 16);
    assert.strictEqual(jsonEmpty.data[0].has_local_pdf, false);
    assert.strictEqual(jsonEmpty.data[0].has_local_md, false);
    assert.strictEqual(fs.readdirSync(tempCoursesDir).length, 0);

    const courseDir = path.join(tempCoursesDir, "9999 - Materia Test");
    fs.mkdirSync(courseDir, { recursive: true });
    fs.writeFileSync(path.join(courseDir, "M1_L1_Intro.pdf"), "%PDF-1.4 test");

    const resWithPdf = await fetch(`${baseUrl}/api/canvas/courses/9999/readings-catalog`);
    assert.strictEqual(resWithPdf.status, 200);
    const jsonWithPdf = (await resWithPdf.json()) as any;
    assert.strictEqual(jsonWithPdf.data[0].has_local_pdf, true);
    assert.strictEqual(jsonWithPdf.data[0].has_local_md, false);
  });

  it("GET /api/canvas/courses/:id/reading-text debe extraer texto de lectura solo-PDF y persistir Markdown", async () => {
    const courseDir = path.join(tempCoursesDir, "9998 - Materia Solo PDF");
    fs.mkdirSync(courseDir, { recursive: true });
    fs.writeFileSync(
      path.join(courseDir, "M1_L2_Arquitectura_HTTP.pdf"),
      buildMinimalPdf("Hola Siglo 21 PDF Local")
    );

    const res = await fetch(`${baseUrl}/api/canvas/courses/9998/reading-text?module=1&reading=2`);
    assert.strictEqual(res.status, 200);
    const json = (await res.json()) as any;
    assert.strictEqual(json.ok, true);
    assert.strictEqual(json.data.source, "local");
    assert.strictEqual(json.data.local, true);
    assert.match(json.data.text, /Hola Siglo 21 PDF Local/);
    assert.ok(json.data.md_path && fs.existsSync(json.data.md_path));
  });

  it("GET /api/canvas/courses/:id/reading-text con solo-PDF corrupto debe pasar al flujo online (503 sin cliente)", async () => {
    const courseDir = path.join(tempCoursesDir, "9997 - Materia PDF Roto");
    fs.mkdirSync(courseDir, { recursive: true });
    fs.writeFileSync(path.join(courseDir, "M2_L1_Archivo_Roto.pdf"), "%PDF-1.4 roto");

    const res = await fetch(`${baseUrl}/api/canvas/courses/9997/reading-text?module=2&reading=1`);
    assert.strictEqual(res.status, 503);
    const json = (await res.json()) as any;
    assert.strictEqual(json.ok, false);
  });
});
