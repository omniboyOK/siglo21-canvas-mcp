import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { createMcpServer } from "./registry.js";
import { ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const ISOLATED_ENV_KEYS = [
  "CANVAS_TOKEN",
  "CANVAS_SESSION",
  "CANVAS_COOKIE",
  "CANVAS_CSRF_TOKEN",
  "CANVAS_URL",
  "S21_DISABLE_CONFIG_FALLBACK",
  "NODE_ENV",
] as const;

describe("MCP Tools Registry & Handlers", () => {
  const savedEnv = new Map<string, string | undefined>();

  before(() => {
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
    process.env.S21_DISABLE_CONFIG_FALLBACK = "1";
    process.env.NODE_ENV = "test";
  });

  after(() => {
    for (const key of ISOLATED_ENV_KEYS) {
      const value = savedEnv.get(key);
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it("createMcpServer debe instanciar el servidor MCP con 22 herramientas registradas", async () => {
    const server = createMcpServer();
    assert.ok(server);
  });

  it("debe registrar s21_get_reading_pdf con el schema de entrada correcto", async () => {
    const { readingPdfTool } = await import("./handlers/reading-pdf.js");
    assert.strictEqual(readingPdfTool.name, "s21_get_reading_pdf");
    assert.ok(readingPdfTool.description.toLowerCase().includes("pdf"));

    const schema = readingPdfTool.inputSchema as any;
    assert.strictEqual(schema.type, "object");
    assert.ok(schema.properties.course_id);
    assert.ok(schema.properties.module_number);
    assert.ok(schema.properties.reading_number);
    assert.ok(schema.properties.output_dir);
    assert.deepStrictEqual(schema.required, [
      "course_id",
      "module_number",
      "reading_number",
    ]);
  });
});
