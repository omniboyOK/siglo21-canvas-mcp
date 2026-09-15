/**
 * Canvas LMS HTTP Client — Transport layer.
 *
 * Solo se encarga de:
 * - Configuración de autenticación
 * - Peticiones HTTP con manejo de paginación
 * - Descarga segura de PDFs
 *
 * La lógica de negocio vive en los services (courses, content, events, dashboard).
 */

import { USER_AGENT } from "../config/constants.js";
import { downloadAndExtractPdf, isCanvasUrl } from "../content/pdf.js";

export interface CanvasClientConfig {
  baseUrl: string;
  token?: string;
  sessionCookie?: string;
  csrfToken?: string;
}

export class CanvasClient {
  private baseUrl: string;
  private token?: string;
  private sessionCookie?: string;
  private csrfToken?: string;

  constructor(config: CanvasClientConfig) {
    this.baseUrl = config.baseUrl.trim().replace(/\/+$/, "");
    this.token = config.token?.trim();
    this.sessionCookie = config.sessionCookie?.trim();
    this.csrfToken = config.csrfToken?.trim();
  }

  public getBaseUrl(): string {
    return this.baseUrl;
  }

  public getAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "User-Agent": USER_AGENT,
    };

    if (this.token) {
      headers["Authorization"] = `Bearer ${this.token}`;
    }

    if (this.sessionCookie) {
      let cookieStr = this.sessionCookie;
      if (!cookieStr.includes("=")) {
        cookieStr = `canvas_session=${cookieStr}`;
      }
      if (this.csrfToken && !cookieStr.includes("_csrf_token=")) {
        cookieStr += `; _csrf_token=${this.csrfToken}`;
      }
      headers["Cookie"] = cookieStr;
    }

    if (this.csrfToken) {
      headers["X-CSRF-Token"] = this.csrfToken;
    }

    return headers;
  }

  /**
   * Descarga y procesa un PDF asegurando que solo se adjunten credenciales a dominios oficiales de Canvas.
   */
  public async downloadPdf(url: string, maxPages?: number) {
    const authHeaders = isCanvasUrl(url, this.baseUrl)
      ? this.getAuthHeaders()
      : undefined;
    return downloadAndExtractPdf(url, authHeaders, maxPages, this.baseUrl);
  }

  /**
   * @deprecated Utilizar downloadPdf() o getAuthHeaders() para evitar exposición innecesaria del token en memoria.
   */
  public getRawToken(): string {
    return this.token || "";
  }

  /**
   * Realiza una petición HTTP a la API de Canvas con autenticación y parseo de paginación.
   */
  public async request(
    endpointOrUrl: string
  ): Promise<{ data: any; nextUrl: string | null }> {
    const url = endpointOrUrl.startsWith("http")
      ? endpointOrUrl
      : `${this.baseUrl}/api/v1/${endpointOrUrl.replace(/^\/+/, "")}`;

    const headers: Record<string, string> = {
      ...this.getAuthHeaders(),
      Accept: "application/json",
    };

    const res = await fetch(url, {
      headers,
    });

    if (!res.ok) {
      let errText = "";
      try {
        const errorJson = await res.json();
        errText = JSON.stringify(errorJson);
      } catch {
        errText = await res.text();
      }
      throw new Error(`HTTP ${res.status}: ${errText || res.statusText}`);
    }

    const data = await res.json();

    const linkHeader = res.headers.get("link") || res.headers.get("Link");
    let nextUrl: string | null = null;
    if (linkHeader) {
      const links = linkHeader.split(",");
      for (const l of links) {
        if (l.includes('rel="next"')) {
          const match = l.match(/<([^>]+)>/);
          if (match) {
            nextUrl = match[1];
          }
        }
      }
    }

    return { data, nextUrl };
  }

  /**
   * Recorre todas las páginas de un endpoint paginado y acumula los resultados.
   */
  public async getAllPages(endpoint: string): Promise<any[]> {
    const items: any[] = [];
    let currentUrl: string | null = endpoint;

    while (currentUrl) {
      const { data, nextUrl } = await this.request(currentUrl);
      if (Array.isArray(data)) {
        items.push(...data);
      } else {
        return data;
      }
      currentUrl = nextUrl;
    }

    return items;
  }
}
