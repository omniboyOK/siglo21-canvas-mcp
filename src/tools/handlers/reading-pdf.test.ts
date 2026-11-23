import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { CanvasClient } from "../../canvas/client.js";
import * as storageManager from "../../storageManager.js";

const ISOLATED_ENV_KEYS = [
  "S21_COURSES_DIR",
  "S21_DB_PATH",
  "S21_DISABLE_CONFIG_FALLBACK",
  "NODE_ENV",
] as const;

describe("s21_get_reading_pdf handler", () => {
  const savedEnv = new Map<string, string | undefined>();
  let tempRootDir: string;
  let readingPdfTool: typeof import("./reading-pdf.js").readingPdfTool;

  before(async () => {
    for (const key of ISOLATED_ENV_KEYS) {
      savedEnv.set(key, process.env[key]);
    }
    tempRootDir = fs.mkdtempSync(path.join(os.tmpdir(), "s21-reading-pdf-test-"));
    process.env.S21_COURSES_DIR = tempRootDir;
    process.env.S21_DB_PATH = ":memory:";
    process.env.S21_DISABLE_CONFIG_FALLBACK = "1";
    process.env.NODE_ENV = "test";

    const mod = await import("./reading-pdf.js");
    readingPdfTool = mod.readingPdfTool;
  });

  after(() => {
    for (const key of ISOLATED_ENV_KEYS) {
      const val = savedEnv.get(key);
      if (val === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = val;
      }
    }
    if (tempRootDir && fs.existsSync(tempRootDir)) {
      fs.rmSync(tempRootDir, { recursive: true, force: true });
    }
  });

  it("debe descargar y guardar el PDF binario original desde Canvas en output_dir personalizado", async () => {
    const originalFetch = globalThis.fetch;
    const expectedBytes = Buffer.from("%PDF-1.4\n%Contenido binario de prueba Siglo 21\n%%EOF\n");
    const customOutputDir = path.join(tempRootDir, "custom-out");

    const client = new CanvasClient({
      baseUrl: "https://siglo21.instructure.com",
      token: "placeholder-bearer",
    });

    globalThis.fetch = (async (input: any) => {
      const url = String(input);
      if (url.endsWith("/api/v1/courses/46001")) {
        return new Response(JSON.stringify({ id: 46001, name: "Bases de Datos" }), { status: 200 });
      }
      if (url.endsWith("/pages/modulos") || url.endsWith("/front_page")) {
        return new Response(JSON.stringify({ body: "" }), { status: 200 });
      }
      if (url.includes("/modules")) {
        return new Response(
          JSON.stringify([
            {
              id: 10,
              name: "Módulo 1",
              position: 1,
              items: [
                {
                  id: 101,
                  title: "Lectura 1 - Modelo Relacional",
                  type: "File",
                  content_id: 777,
                },
              ],
            },
          ]),
          { status: 200 }
        );
      }
      if (url.endsWith("/api/v1/files/777")) {
        return new Response(
          JSON.stringify({
            id: 777,
            url: "https://siglo21.instructure.com/files/777/download",
          }),
          { status: 200 }
        );
      }
      if (url === "https://siglo21.instructure.com/files/777/download") {
        return new Response(expectedBytes, { status: 200 });
      }
      return new Response("Not Found", { status: 404 });
    }) as typeof fetch;

    try {
      const result = await readingPdfTool.handler(
        {
          course_id: 46001,
          module_number: 1,
          reading_number: 1,
          output_dir: customOutputDir,
        },
        { client, hasToken: true }
      );

      assert.ok(!result.isError);
      const text = result.content[0].text;
      assert.match(text, /Descarga de Lectura en PDF Completada/);
      assert.match(text, /Origen: Canvas LMS/);

      const savedFiles = fs.readdirSync(customOutputDir);
      assert.strictEqual(savedFiles.length, 1);
      assert.ok(savedFiles[0].endsWith(".pdf"));
      const savedContent = fs.readFileSync(path.join(customOutputDir, savedFiles[0]));
      assert.deepStrictEqual(savedContent, expectedBytes);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("debe usar el PDF local en caché si falla la descarga de red de una lectura SAM", async () => {
    const originalFetch = globalThis.fetch;
    const cachedBytes = Buffer.from("%PDF-1.4\n%Cache local SAM\n%%EOF\n");
    storageManager.saveReadingPdfFile(
      46002,
      1,
      1,
      "Lectura SAM Cacheada",
      cachedBytes,
      "Materia SAM Cache"
    );

    const client = new CanvasClient({
      baseUrl: "https://siglo21.instructure.com",
      token: "placeholder-bearer",
    });

    globalThis.fetch = (async (input: any) => {
      const url = String(input);
      if (url.endsWith("/api/v1/courses/46002")) {
        return new Response(JSON.stringify({ id: 46002, name: "Materia SAM Cache" }), { status: 200 });
      }
      if (url.endsWith("/pages/modulos")) {
        return new Response(
          JSON.stringify({
            body: '<iframe src="https://meca.ues21.edu.ar/demo-46002/L1/index.html"></iframe>',
          }),
          { status: 200 }
        );
      }
      if (url.includes("meca.ues21.edu.ar")) {
        return new Response("Upstream Unavailable", { status: 503, statusText: "Service Unavailable" });
      }
      return new Response("Not Found", { status: 404 });
    }) as typeof fetch;

    try {
      const result = await readingPdfTool.handler(
        {
          course_id: 46002,
          module_number: 1,
          reading_number: 1,
        },
        { client, hasToken: true }
      );

      assert.ok(!result.isError);
      const text = result.content[0].text;
      assert.match(text, /Descarga de Lectura en PDF Completada/);
      assert.match(text, /Caché local previo/);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("no debe tratar una URL no-SAM con query meca.ues21.edu.ar como lectura SAM", async () => {
    const originalFetch = globalThis.fetch;
    let samFetchAttempted = false;

    const client = new CanvasClient({
      baseUrl: "https://siglo21.instructure.com",
      token: "placeholder-bearer",
    });

    globalThis.fetch = (async (input: any) => {
      const url = String(input);
      if (url.startsWith("https://meca.ues21.edu.ar")) {
        samFetchAttempted = true;
      }
      if (url.endsWith("/api/v1/courses/46003")) {
        return new Response(JSON.stringify({ id: 46003, name: "Seguridad" }), { status: 200 });
      }
      if (url.endsWith("/pages/modulos") || url.endsWith("/front_page")) {
        return new Response(JSON.stringify({ body: "" }), { status: 200 });
      }
      if (url.includes("/modules")) {
        return new Response(
          JSON.stringify([
            {
              id: 20,
              name: "Módulo 1",
              position: 1,
              items: [
                {
                  id: 201,
                  title: "Lectura 1",
                  type: "ExternalUrl",
                  url: "https://siglo21.instructure.com/courses/46003?ref=meca.ues21.edu.ar",
                },
              ],
            },
          ]),
          { status: 200 }
        );
      }
      return new Response("Not Found", { status: 404 });
    }) as typeof fetch;

    try {
      const result = await readingPdfTool.handler(
        {
          course_id: 46003,
          module_number: 1,
          reading_number: 1,
        },
        { client, hasToken: true }
      );

      assert.strictEqual(samFetchAttempted, false);
      assert.strictEqual(result.isError, true);
      assert.match(result.content[0].text, /no cuenta con un archivo descargable en Canvas/);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("debe devolver mensaje informativo sin escribir archivos si la lectura no existe", async () => {
    const originalFetch = globalThis.fetch;
    const outputDir = path.join(tempRootDir, "missing-out");

    const client = new CanvasClient({
      baseUrl: "https://siglo21.instructure.com",
      token: "placeholder-bearer",
    });

    globalThis.fetch = (async (input: any) => {
      const url = String(input);
      if (url.endsWith("/api/v1/courses/46004")) {
        return new Response(JSON.stringify({ id: 46004, name: "Vacia" }), { status: 200 });
      }
      if (url.endsWith("/pages/modulos") || url.endsWith("/front_page")) {
        return new Response(JSON.stringify({ body: "" }), { status: 200 });
      }
      if (url.includes("/modules") || url.includes("/assignments")) {
        return new Response(JSON.stringify([]), { status: 200 });
      }
      return new Response("Not Found", { status: 404 });
    }) as typeof fetch;

    try {
      const result = await readingPdfTool.handler(
        {
          course_id: 46004,
          module_number: 2,
          reading_number: 3,
          output_dir: outputDir,
        },
        { client, hasToken: true }
      );

      assert.ok(!result.isError);
      assert.match(result.content[0].text, /No se encontró lectura o actividad específica/);
      assert.strictEqual(fs.existsSync(outputDir), false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
