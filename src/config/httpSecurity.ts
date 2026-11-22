/**
 * Helpers centralizados de seguridad HTTP y protección anti-SSRF.
 * @module config/httpSecurity
 */

export const DEFAULT_FETCH_TIMEOUT_MS = 30_000;
export const DEFAULT_MAX_REDIRECTS = 5;

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const SENSITIVE_HEADER_NAMES = new Set([
  "authorization",
  "cookie",
  "x-csrf-token",
]);

export interface SafeFetchOptions {
  headers?: Record<string, string>;
  authBaseUrl?: string;
  requireCanvasHostOnAllHops?: boolean;
  timeoutMs?: number;
  maxRedirects?: number;
  allowLoopbackHttp?: boolean;
}

function normalizeHost(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/^\[|\]$/g, "");
}

function isPrivateOrReservedIpv4(host: string): boolean {
  const parts = host.split(".");
  if (parts.length !== 4) return false;
  const octets = parts.map((p) => Number(p));
  if (octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return false;
  }

  const [a, b] = octets;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

/**
 * Determina si un hostname corresponde a loopback local.
 */
export function isLoopbackHost(hostname: string): boolean {
  const h = normalizeHost(hostname);
  return (
    h === "localhost" ||
    h === "::1" ||
    h === "0.0.0.0" ||
    h === "::" ||
    /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h)
  );
}

/**
 * Determina si un hostname apunta a una red privada, loopback o dominio interno.
 */
export function isBlockedPrivateHost(hostname: string): boolean {
  const h = normalizeHost(hostname);
  if (!h) return true;

  if (isLoopbackHost(h)) return true;
  if (
    h.endsWith(".local") ||
    h.endsWith(".internal") ||
    h.endsWith(".localhost")
  ) {
    return true;
  }

  if (isPrivateOrReservedIpv4(h)) return true;

  // Bloquear IPv4-mapped IPv6 y rangos locales IPv6 (ULA fc00::/7, link-local fe80::/10)
  if (h.startsWith("::ffff:")) return true;
  if (
    h.startsWith("fc") ||
    h.startsWith("fd") ||
    /^fe[89ab][0-9a-f]/i.test(h)
  ) {
    return true;
  }

  return false;
}

/**
 * Valida que una URL pertenezca al dominio configurado de Canvas LMS usando HTTPS
 * (solo admite HTTP si tanto baseUrl como target apuntan al mismo host loopback).
 */
export function isCanvasUrl(url: string, canvasBaseUrl: string): boolean {
  try {
    const parsed = new URL(url);
    const base = new URL(canvasBaseUrl);

    if (parsed.username || parsed.password) {
      return false;
    }

    const canvasHost = normalizeHost(base.hostname);
    const targetHost = normalizeHost(parsed.hostname);

    const isAllowedHttpLoopback =
      parsed.protocol === "http:" &&
      base.protocol === "http:" &&
      isLoopbackHost(base.hostname) &&
      targetHost === canvasHost;

    if (parsed.protocol !== "https:" && !isAllowedHttpLoopback) {
      return false;
    }

    return targetHost === canvasHost || targetHost.endsWith(".instructure.com");
  } catch {
    return false;
  }
}

function isMatchingHttpLoopbackBase(
  targetHostname: string,
  authBaseUrl?: string
): boolean {
  if (!authBaseUrl) return false;
  try {
    const base = new URL(authBaseUrl);
    return (
      base.protocol === "http:" &&
      isLoopbackHost(base.hostname) &&
      normalizeHost(targetHostname) === normalizeHost(base.hostname)
    );
  } catch {
    return false;
  }
}

function stripSensitiveHeaders(
  headers: Record<string, string>
): Record<string, string> {
  const sanitized: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (!SENSITIVE_HEADER_NAMES.has(key.toLowerCase())) {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

/**
 * Ejecuta fetch con timeout, validación anti-SSRF en cada salto de redirección
 * y eliminación de credenciales sensibles al redirigir fuera del dominio Canvas.
 */
export async function safeFetch(
  url: string,
  options: SafeFetchOptions = {}
): Promise<Response> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS;
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  const baseHeaders = options.headers ?? {};

  let currentUrl = url;
  let redirects = 0;

  while (true) {
    let parsed: URL;
    try {
      parsed = new URL(currentUrl);
    } catch {
      throw new Error(`URL inválida: ${currentUrl}`);
    }

    if (parsed.username || parsed.password) {
      throw new Error("URL bloqueada: no se permiten credenciales embebidas");
    }

    const allowThisLoopbackHttp =
      parsed.protocol === "http:" &&
      isLoopbackHost(parsed.hostname) &&
      (options.allowLoopbackHttp === true ||
        isMatchingHttpLoopbackBase(parsed.hostname, options.authBaseUrl));

    if (parsed.protocol !== "https:" && !allowThisLoopbackHttp) {
      throw new Error(
        `Protocolo HTTP bloqueado para ${parsed.hostname}: solo se permite HTTPS`
      );
    }

    if (options.requireCanvasHostOnAllHops) {
      if (!options.authBaseUrl || !isCanvasUrl(currentUrl, options.authBaseUrl)) {
        throw new Error("URL bloqueada: fuera del dominio oficial de Canvas");
      }
    } else if (isBlockedPrivateHost(parsed.hostname) && !allowThisLoopbackHttp) {
      throw new Error(
        `URL bloqueada por política anti-SSRF: ${parsed.hostname}`
      );
    }

    const hopHeaders = options.authBaseUrl
      ? isCanvasUrl(currentUrl, options.authBaseUrl)
        ? { ...baseHeaders }
        : stripSensitiveHeaders(baseHeaders)
      : { ...baseHeaders };

    const response = await fetch(currentUrl, {
      headers: hopHeaders,
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!REDIRECT_STATUSES.has(response.status)) {
      return response;
    }

    const location = response.headers.get("location");
    if (!location) {
      return response;
    }

    await response.body?.cancel().catch(() => {});

    if (redirects >= maxRedirects) {
      throw new Error(`Demasiadas redirecciones HTTP (máximo ${maxRedirects})`);
    }

    redirects += 1;
    currentUrl = new URL(location, currentUrl).toString();
  }
}
