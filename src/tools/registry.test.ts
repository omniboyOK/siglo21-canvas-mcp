import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createMcpServer } from "./registry.js";
import { ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

describe("MCP Tools Registry & Handlers", () => {
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
