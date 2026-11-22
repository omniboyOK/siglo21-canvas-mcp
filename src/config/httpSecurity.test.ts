import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CanvasClient } from "../canvas/client.js";
import { safeFetch } from "./httpSecurity.js";

describe("Seguridad HTTP y anti-SSRF (safeFetch + CanvasClient)", () => {
  it("safeFetch debe mantener credenciales en Canvas y limpiarlas al redirigir a un host externo", async () => {
    const originalFetch = globalThis.fetch;
    const calls: Array<{ url: string; headers: Record<string, string> }> = [];

    globalThis.fetch = (async (input: any, init?: RequestInit) => {
      const target = String(input);
      const headers = Object.fromEntries(
        new Headers(init?.headers).entries()
      );
      calls.push({ url: target, headers });

      if (calls.length === 1) {
        return new Response(null, {
          status: 302,
          headers: {
            location: "https://instructure-uploads.s3.amazonaws.com/signed.pdf",
          },
        });
      }
      return new Response("pdf-bytes", { status: 200 });
    }) as typeof fetch;

    try {
      const res = await safeFetch("https://siglo21.instructure.com/files/1/download", {
        headers: {
          "User-Agent": "S21-Test/1.0",
          Authorization: "Bearer placeholder-bearer",
          Cookie: "canvas_session=placeholder-session",
          "X-CSRF-Token": "placeholder-csrf",
        },
        authBaseUrl: "https://siglo21.instructure.com",
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(calls.length, 2);
      assert.strictEqual(calls[0].headers["authorization"], "Bearer placeholder-bearer");
      assert.strictEqual(calls[0].headers["cookie"], "canvas_session=placeholder-session");
      assert.strictEqual(calls[0].headers["x-csrf-token"], "placeholder-csrf");

      assert.strictEqual(
        calls[1].url,
        "https://instructure-uploads.s3.amazonaws.com/signed.pdf"
      );
      assert.strictEqual(calls[1].headers["user-agent"], "S21-Test/1.0");
      assert.strictEqual(calls[1].headers["authorization"], undefined);
      assert.strictEqual(calls[1].headers["cookie"], undefined);
      assert.strictEqual(calls[1].headers["x-csrf-token"], undefined);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("safeFetch debe bloquear redirecciones inseguras (downgrade HTTP) o a IPs privadas (SSRF)", async () => {
    const originalFetch = globalThis.fetch;

    try {
      const blockedTargets = [
        "http://siglo21.instructure.com/downgrade",
        "https://169.254.169.254/latest/meta-data",
        "https://127.0.0.1/internal",
        "https://10.0.0.5/secret",
      ];

      for (const blockedLocation of blockedTargets) {
        let count = 0;
        globalThis.fetch = (async () => {
          count += 1;
          return new Response(null, {
            status: 302,
            headers: { location: blockedLocation },
          });
        }) as typeof fetch;

        await assert.rejects(
          () =>
            safeFetch("https://siglo21.instructure.com/files/1/download", {
              authBaseUrl: "https://siglo21.instructure.com",
            }),
          /bloquead|HTTPS|SSRF/i
        );
        assert.strictEqual(count, 1);
      }
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("safeFetch debe rechazar redirección externa cuando requireCanvasHostOnAllHops es true", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      return new Response(null, {
        status: 302,
        headers: { location: "https://evil.example/steal" },
      });
    }) as typeof fetch;

    try {
      await assert.rejects(
        () =>
          safeFetch("https://siglo21.instructure.com/api/v1/courses", {
            authBaseUrl: "https://siglo21.instructure.com",
            requireCanvasHostOnAllHops: true,
          }),
        /fuera del dominio oficial de Canvas/
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("safeFetch debe cortar bucles de redirección y respetar timeoutMs", async () => {
    const originalFetch = globalThis.fetch;

    try {
      let hop = 0;
      globalThis.fetch = (async () => {
        hop += 1;
        return new Response(null, {
          status: 302,
          headers: { location: `https://siglo21.instructure.com/step-${hop}` },
        });
      }) as typeof fetch;

      await assert.rejects(
        () =>
          safeFetch("https://siglo21.instructure.com/start", {
            authBaseUrl: "https://siglo21.instructure.com",
            maxRedirects: 2,
          }),
        /Demasiadas redirecciones HTTP/
      );
      assert.strictEqual(hop, 3);

      globalThis.fetch = ((_input: any, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          const fallbackTimer = setTimeout(() => {
            reject(new Error("AbortSignal.timeout did not abort in time"));
          }, 5000);
          const onAbort = () => {
            clearTimeout(fallbackTimer);
            reject(init?.signal?.reason || new Error("Aborted"));
          };
          if (init?.signal?.aborted) {
            onAbort();
            return;
          }
          init?.signal?.addEventListener("abort", onAbort, { once: true });
        })) as typeof fetch;

      await assert.rejects(
        () =>
          safeFetch("https://siglo21.instructure.com/slow", {
            authBaseUrl: "https://siglo21.instructure.com",
            timeoutMs: 30,
          }),
        (err: any) =>
          err?.name === "TimeoutError" || /aborted due to timeout/i.test(String(err))
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("CanvasClient.request debe rechazar URLs fuera de Canvas e ignorar Link next externos", async () => {
    const originalFetch = globalThis.fetch;
    let fetchCalled = false;

    const client = new CanvasClient({
      baseUrl: "https://siglo21.instructure.com",
      token: "placeholder-bearer",
    });

    try {
      globalThis.fetch = (async () => {
        fetchCalled = true;
        return new Response(JSON.stringify([{ id: 1 }]), {
          status: 200,
          headers: {
            link: '<https://evil.example/api/v1/courses?page=2>; rel="next"',
          },
        });
      }) as typeof fetch;

      await assert.rejects(
        () => client.request("https://evil.example/api/v1/courses"),
        /URL fuera del dominio oficial de Canvas/
      );
      assert.strictEqual(fetchCalled, false);

      const page = await client.request("courses");
      assert.strictEqual(fetchCalled, true);
      assert.deepStrictEqual(page.data, [{ id: 1 }]);
      assert.strictEqual(page.nextUrl, null);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
