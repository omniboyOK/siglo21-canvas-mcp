import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { TOOLS_CATALOG } from "./toolsCatalog.js";

describe("Catálogo de Herramientas MCP", () => {
  it("debe contener una lista de herramientas registradas", () => {
    assert.ok(Array.isArray(TOOLS_CATALOG));
    assert.ok(TOOLS_CATALOG.length >= 10, "Debe haber al menos 10 herramientas en el catálogo");
  });

  it("cada herramienta debe tener un identificador único con prefijo s21_", () => {
    const ids = new Set<string>();
    for (const tool of TOOLS_CATALOG) {
      assert.ok(tool.id, "La herramienta debe tener un id");
      assert.ok(tool.id.startsWith("s21_"), `El ID '${tool.id}' debe comenzar con s21_`);
      assert.ok(!ids.has(tool.id), `ID duplicado encontrado en catálogo: ${tool.id}`);
      ids.add(tool.id);
    }
  });

  it("todas las herramientas deben tener metadatos pedagógicos completos", () => {
    const validCategories = new Set(["examenes", "notas", "tps", "lecturas", "avisos"]);

    for (const tool of TOOLS_CATALOG) {
      assert.ok(tool.name?.trim(), `Herramienta ${tool.id} sin nombre`);
      assert.ok(validCategories.has(tool.category), `Herramienta ${tool.id} con categoría inválida: ${tool.category}`);
      assert.ok(tool.categoryLabel?.trim(), `Herramienta ${tool.id} sin etiqueta de categoría`);
      assert.ok(tool.summary?.trim(), `Herramienta ${tool.id} sin resumen`);
      assert.ok(tool.benefit?.trim(), `Herramienta ${tool.id} sin beneficio para el estudiante`);
      assert.ok(tool.examplePrompt?.trim(), `Herramienta ${tool.id} sin prompt de ejemplo`);
    }
  });
});
