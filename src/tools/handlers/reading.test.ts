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

describe("s21_get_reading handler (caché solo-PDF offline-first)", () => {
  const savedEnv = new Map<string, string | undefined>();
  let tempRootDir: string;
  let readingTool: typeof import("./reading.js").readingTool;

  before(async () => {
    for (const key of ISOLATED_ENV_KEYS) {
      savedEnv.set(key, process.env[key]);
    }
    tempRootDir = fs.mkdtempSync(path.join(os.tmpdir(), "s21-reading-test-"));
    process.env.S21_COURSES_DIR = tempRootDir;
    process.env.S21_DB_PATH = ":memory:";
    process.env.S21_DISABLE_CONFIG_FALLBACK = "1";
    process.env.NODE_ENV = "test";

    const mod = await import("./reading.js");
    readingTool = mod.readingTool;
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

  it("debe extraer texto offline-first desde una lectura solo-PDF sin llamar a fetch y guardar el Markdown", async () => {
    const originalFetch = globalThis.fetch;
    let fetchCalled = false;

    storageManager.saveReadingPdfFile(
      47001,
      1,
      1,
      "Lectura Solo PDF",
      buildMinimalPdf("Contenido offline PDF Siglo 21"),
      "Curso Solo PDF"
    );

    const client = new CanvasClient({
      baseUrl: "https://siglo21.instructure.com",
      token: "placeholder-bearer",
    });

    globalThis.fetch = (async () => {
      fetchCalled = true;
      return new Response("unexpected", { status: 500 });
    }) as typeof fetch;

    try {
      const result = await readingTool.handler(
        { course_id: 47001, module_number: 1, reading_number: 1 },
        { client, hasToken: true }
      );

      assert.strictEqual(fetchCalled, false);
      assert.ok(!result.isError);
      assert.match(result.content[0].text, /Offline-First/);
      assert.match(result.content[0].text, /Contenido offline PDF Siglo 21/);

      const savedLocal = storageManager.getReading(47001, 1, 1);
      assert.ok(savedLocal);
      assert.match(savedLocal.markdown, /Contenido offline PDF Siglo 21/);
      assert.ok(savedLocal.mdPath && fs.existsSync(savedLocal.mdPath));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("si un PDF local guardado falla al parsearse, debe continuar al flujo online sin devolver texto vacío", async () => {
    const originalFetch = globalThis.fetch;
    let fetchCalled = false;

    storageManager.saveReadingPdfFile(
      47002,
      1,
      2,
      "PDF Corrupto Local",
      Buffer.from("%PDF-1.4 corrupto"),
      "Curso Fallback Online"
    );

    const client = new CanvasClient({
      baseUrl: "https://siglo21.instructure.com",
      token: "placeholder-bearer",
    });

    globalThis.fetch = (async (input: any) => {
      fetchCalled = true;
      const url = String(input);
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
                  id: 102,
                  title: "Lectura 2 - Respaldo Online",
                  type: "Page",
                  url: "https://siglo21.instructure.com/courses/47002/pages/lectura-2",
                },
              ],
            },
          ]),
          { status: 200 }
        );
      }
      return new Response(JSON.stringify({}), { status: 200 });
    }) as typeof fetch;

    try {
      const result = await readingTool.handler(
        { course_id: 47002, module_number: 1, reading_number: 2 },
        { client, hasToken: true }
      );

      assert.strictEqual(fetchCalled, true);
      assert.ok(!result.isError);
      assert.match(result.content[0].text, /Lectura Encontrada/);
      assert.match(result.content[0].text, /Lectura 2 - Respaldo Online/);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
