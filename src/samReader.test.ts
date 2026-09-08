import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { extractSamCatalog, fetchAndParseSamReading } from "./samReader.js";

describe("Extractor SAM y Lector de Contenidos (samReader)", () => {
  it("debe extraer correctamente el catálogo de 16 lecturas a partir del HTML de modulos", () => {
    const mockHtml = `
      <div id="containerM1">
        <h2 class="titulo_de_articulo">
          <a title="M1-Lectura 1" href="#lectura1m1"><span>Motores de Bases de Datos</span></a>
        </h2>
        <h2 class="titulo_de_articulo">
          <a title="M1-Lectura 2" href="#lectura2m1"><span>Componentes de MySQL</span></a>
        </h2>
      </div>
      <div id="containerM4">
        <a id="lectura1m1" href="#_">
          <iframe src="https://meca.ues21.edu.ar/canvas/0Articulo432021/basesdedatosi/L1/index.html"></iframe>
        </a>
        <a id="lectura2m1" href="#_">
          <iframe src="https://meca.ues21.edu.ar/canvas/0Articulo432021/basesdedatosi/L2/index.html"></iframe>
        </a>
        <a id="lectura1m2" href="#_">
          <iframe src="https://meca.ues21.edu.ar/canvas/0Articulo432021/basesdedatosi/L5/index.html"></iframe>
        </a>
      </div>
    `;

    const catalog = extractSamCatalog(mockHtml);
    assert.ok(catalog.length >= 3);

    const m1l1 = catalog.find((c) => c.moduleNumber === 1 && c.readingNumber === 1);
    assert.ok(m1l1);
    assert.strictEqual(m1l1.globalIndex, 1);
    assert.strictEqual(m1l1.url, "https://meca.ues21.edu.ar/canvas/0Articulo432021/basesdedatosi/L1/index.html");
    assert.strictEqual(m1l1.title, "Motores de Bases de Datos");

    const m1l2 = catalog.find((c) => c.moduleNumber === 1 && c.readingNumber === 2);
    assert.ok(m1l2);
    assert.strictEqual(m1l2.globalIndex, 2);
    assert.strictEqual(m1l2.url, "https://meca.ues21.edu.ar/canvas/0Articulo432021/basesdedatosi/L2/index.html");
    assert.strictEqual(m1l2.title, "Componentes de MySQL");

    const m2l1 = catalog.find((c) => c.moduleNumber === 2 && c.readingNumber === 1);
    assert.ok(m2l1);
    assert.strictEqual(m2l1.globalIndex, 5);
    assert.strictEqual(m2l1.url, "https://meca.ues21.edu.ar/canvas/0Articulo432021/basesdedatosi/L5/index.html");
  });

  it("debe mapear correctamente la fórmula de índices globales (1..16)", () => {
    // Generar un HTML sintético con 16 iframes L1..L16
    const iframes = Array.from({ length: 16 }, (_, i) => 
      `<iframe src="https://meca.ues21.edu.ar/canvas/curso_demo/L${i + 1}/index.html"></iframe>`
    ).join("\n");

    const catalog = extractSamCatalog(`<div>${iframes}</div>`);
    assert.strictEqual(catalog.length, 16);

    for (let m = 1; m <= 4; m++) {
      for (let r = 1; r <= 4; r++) {
        const expectedGlobal = (m - 1) * 4 + r;
        const item = catalog.find((x) => x.moduleNumber === m && x.readingNumber === r);
        assert.ok(item, `Debe existir Módulo ${m}, Lectura ${r}`);
        assert.strictEqual(item.globalIndex, expectedGlobal);
        assert.strictEqual(
          item.url,
          `https://meca.ues21.edu.ar/canvas/curso_demo/L${expectedGlobal}/index.html`
        );
      }
    }
  });
});
