import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isCanvasUrl } from "./pdfReader.js";

describe("Validación de seguridad de URLs (isCanvasUrl)", () => {
  const canvasBase = "https://siglo21.instructure.com";

  it("debe aceptar URLs correspondientes al dominio base de Canvas", () => {
    assert.strictEqual(
      isCanvasUrl("https://siglo21.instructure.com/files/12345/download", canvasBase),
      true
    );
  });

  it("debe aceptar subdominios oficiales de instructure.com", () => {
    assert.strictEqual(
      isCanvasUrl("https://canvas.instructure.com/doc.pdf", canvasBase),
      true
    );
  });

  it("debe rechazar dominios externos maliciosos (SSRF)", () => {
    assert.strictEqual(
      isCanvasUrl("https://evil.com/malicious.pdf", canvasBase),
      false
    );
    assert.strictEqual(
      isCanvasUrl("https://attacker.org/token-leak", canvasBase),
      false
    );
    assert.strictEqual(
      isCanvasUrl("https://siglo21.instructure.com.evil.com/doc.pdf", canvasBase),
      false
    );
  });

  it("debe rechazar URLs malformadas", () => {
    assert.strictEqual(isCanvasUrl("not-a-url", canvasBase), false);
    assert.strictEqual(isCanvasUrl("", canvasBase), false);
  });
});
