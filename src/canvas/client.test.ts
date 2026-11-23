import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CanvasClient } from "./client.js";

describe("CanvasClient (auth, errores HTTP y paginación)", () => {
  it("getAuthHeaders debe construir cabeceras para token, sesión web, cookie completa y recortar espacios", () => {
    const tokenClient = new CanvasClient({
      baseUrl: "  https://siglo21.instructure.com///  ",
      token: "  placeholder-bearer  ",
    });
    assert.strictEqual(tokenClient.getBaseUrl(), "https://siglo21.instructure.com");
    const tokenHeaders = tokenClient.getAuthHeaders();
    assert.ok(tokenHeaders["User-Agent"]);
    assert.strictEqual(tokenHeaders["Authorization"], "Bearer placeholder-bearer");
    assert.strictEqual(tokenHeaders["Cookie"], undefined);
    assert.strictEqual(tokenHeaders["X-CSRF-Token"], undefined);

    const sessionClient = new CanvasClient({
      baseUrl: "https://siglo21.instructure.com",
      sessionCookie: "  placeholder-session  ",
      csrfToken: "  placeholder-csrf  ",
    });
    const sessionHeaders = sessionClient.getAuthHeaders();
    assert.strictEqual(
      sessionHeaders["Cookie"],
      "canvas_session=placeholder-session; _csrf_token=placeholder-csrf"
    );
    assert.strictEqual(sessionHeaders["X-CSRF-Token"], "placeholder-csrf");
    assert.strictEqual(sessionHeaders["Authorization"], undefined);

    const fullCookieClient = new CanvasClient({
      baseUrl: "https://siglo21.instructure.com",
      sessionCookie: "canvas_session=placeholder-session; _csrf_token=placeholder-csrf",
      csrfToken: "placeholder-csrf",
    });
    const fullCookieHeaders = fullCookieClient.getAuthHeaders();
    assert.strictEqual(
      fullCookieHeaders["Cookie"],
      "canvas_session=placeholder-session; _csrf_token=placeholder-csrf"
    );
    assert.strictEqual(
      (fullCookieHeaders["Cookie"].match(/_csrf_token=/g) || []).length,
      1
    );
    assert.strictEqual(fullCookieHeaders["X-CSRF-Token"], "placeholder-csrf");
  });

  it("request debe manejar errores JSON, HTML no-JSON sin relectura de body y cuerpos vacíos", async () => {
    const originalFetch = globalThis.fetch;
    const client = new CanvasClient({
      baseUrl: "https://siglo21.instructure.com",
      token: "placeholder-bearer",
    });

    try {
      globalThis.fetch = (async () =>
        new Response(JSON.stringify({ errors: [{ message: "Invalid access token" }] }), {
          status: 401,
          statusText: "Unauthorized",
          headers: { "content-type": "application/json" },
        })) as typeof fetch;

      await assert.rejects(
        () => client.request("courses"),
        /HTTP 401: .*"Invalid access token"/
      );

      globalThis.fetch = (async () =>
        new Response("<html><body>502 Bad Gateway</body></html>", {
          status: 502,
          statusText: "Bad Gateway",
          headers: { "content-type": "text/html" },
        })) as typeof fetch;

      await assert.rejects(
        () => client.request("courses"),
        (err: any) => {
          assert.match(err.message, /HTTP 502: .*502 Bad Gateway/);
          assert.doesNotMatch(err.message, /Body has already been read/i);
          return true;
        }
      );

      globalThis.fetch = (async () =>
        new Response("", {
          status: 503,
          statusText: "Service Unavailable",
        })) as typeof fetch;

      await assert.rejects(
        () => client.request("courses"),
        /^Error: HTTP 503: Service Unavailable$|HTTP 503: Service Unavailable/
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("getAllPages debe recorrer múltiples páginas Canvas, cortar enlaces externos y devolver objetos directos", async () => {
    const originalFetch = globalThis.fetch;
    const requestedUrls: string[] = [];
    const client = new CanvasClient({
      baseUrl: "https://siglo21.instructure.com",
      token: "placeholder-bearer",
    });

    try {
      globalThis.fetch = (async (input: any) => {
        const url = String(input);
        requestedUrls.push(url);
        if (url === "https://siglo21.instructure.com/api/v1/courses?per_page=2") {
          return new Response(JSON.stringify([{ id: 1 }, { id: 2 }]), {
            status: 200,
            headers: {
              link: '<https://siglo21.instructure.com/api/v1/courses?page=2>; rel="next", <https://siglo21.instructure.com/api/v1/courses?page=1>; rel="prev"',
            },
          });
        }
        return new Response(JSON.stringify([{ id: 3 }]), {
          status: 200,
          headers: {
            link: '<https://evil.example/api/v1/courses?page=3>; rel="next"',
          },
        });
      }) as typeof fetch;

      const allCourses = await client.getAllPages("courses?per_page=2");
      assert.deepStrictEqual(allCourses, [{ id: 1 }, { id: 2 }, { id: 3 }]);
      assert.deepStrictEqual(requestedUrls, [
        "https://siglo21.instructure.com/api/v1/courses?per_page=2",
        "https://siglo21.instructure.com/api/v1/courses?page=2",
      ]);

      requestedUrls.length = 0;
      globalThis.fetch = (async () =>
        new Response(JSON.stringify({ id: 99, name: "Perfil" }), {
          status: 200,
        })) as typeof fetch;

      const objResult = await client.getAllPages("users/self");
      assert.deepStrictEqual(objResult, { id: 99, name: "Perfil" });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
