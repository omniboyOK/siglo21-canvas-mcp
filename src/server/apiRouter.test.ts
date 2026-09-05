import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { URL } from "node:url";

// Base de datos en memoria para los tests
process.env.S21_DB_PATH = ":memory:";

import { handleApiRequest } from "./apiRouter.js";
import { ExamRepository } from "../db/examRepository.js";
import { getDb } from "../db/database.js";

describe("Micro-Router REST API (/api/*)", () => {
  let server: http.Server;
  let baseUrl: string;

  before(async () => {
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

  it("GET /api/canvas/courses/12345/modules debe responder con respuesta estructurada JSON", async () => {
    const res = await fetch(`${baseUrl}/api/canvas/courses/12345/modules`);
    assert.ok([200, 500, 503].includes(res.status));
    const json = (await res.json()) as any;
    assert.ok(typeof json.ok === "boolean");
  });
});
