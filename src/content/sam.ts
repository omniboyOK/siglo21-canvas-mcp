/**
 * Lector y parser de lecturas SAM (meca.ues21.edu.ar).
 * @module content/sam
 */

import { cleanHtmlToMarkdown } from "./html.js";

export interface SamReadingItem {
  moduleNumber: number;
  readingNumber: number;
  globalIndex: number; // 1 a 16
  title: string;
  url: string;
}

export interface SamReadingContent {
  title: string;
  markdown: string;
  url: string;
  sourceType: "rise" | "html";
  charCount: number;
}

// Caché en memoria para evitar re-descargar lecturas y catálogos durante la sesión
const catalogCache = new Map<number, { items: SamReadingItem[]; timestamp: number }>();
const contentCache = new Map<string, { content: SamReadingContent; timestamp: number }>();
const CACHE_TTL_MS = 1000 * 60 * 60; // 1 hora

/**
 * Extrae el catálogo estructurado de las 16 lecturas SAM de una materia a partir del HTML
 * de la página de módulos (`pages/modulos`) o de la portada (`front_page`).
 */
export function extractSamCatalog(html: string): SamReadingItem[] {
  if (!html) return [];

  // 1. Extraer todos los enlaces / iframes que apunten a meca.ues21.edu.ar
  const mecaUrls: string[] = [];
  const iframeMatches = [...html.matchAll(/src=["'](https:\/\/meca\.ues21\.edu\.ar\/[^"']+)["']/gi)];
  for (const m of iframeMatches) {
    const cleanUrl = m[1].replace(/&amp;/g, "&").trim();
    if (!mecaUrls.includes(cleanUrl)) {
      mecaUrls.push(cleanUrl);
    }
  }

  // Si no había iframes src, buscar enlaces href a meca
  if (mecaUrls.length === 0) {
    const hrefMatches = [...html.matchAll(/href=["'](https:\/\/meca\.ues21\.edu\.ar\/[^"']+)["']/gi)];
    for (const m of hrefMatches) {
      const cleanUrl = m[1].replace(/&amp;/g, "&").trim();
      if (!mecaUrls.includes(cleanUrl)) {
        mecaUrls.push(cleanUrl);
      }
    }
  }

  // Filtrar solo las URLs que corresponden a lecturas (suelen tener /L{num}/)
  const readingUrls = mecaUrls.filter((u) => /\/L\d+\//i.test(u));
  const effectiveUrls = readingUrls.length > 0 ? readingUrls : mecaUrls;

  // 2. Extraer títulos y anclas desde los botones/enlaces en el menú HTML
  const titlesByAnchor = new Map<string, string>();
  const titlesBySlot = new Map<string, string>(); // clave: `${m}-${r}`

  // Regex para capturar enlaces con título de lectura
  const linkRegex = /<a[^>]*title=["'](?:M?(\d+)[-_ ])?Lectura\s*(\d+)[^"']*["'][^>]*href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let lMatch;
  while ((lMatch = linkRegex.exec(html)) !== null) {
    const modFromTitle = lMatch[1] ? Number(lMatch[1]) : undefined;
    const readNum = Number(lMatch[2]);
    const href = lMatch[3] || "";
    const innerText = cleanHtmlToMarkdown(lMatch[4]).replace(/ver m[aá]s/gi, "").trim();

    if (href.startsWith("#")) {
      const anchor = href.replace(/^#/, "");
      if (innerText && !titlesByAnchor.has(anchor)) {
        titlesByAnchor.set(anchor, innerText);
      }
    }

    if (modFromTitle && readNum && innerText) {
      titlesBySlot.set(`${modFromTitle}-${readNum}`, innerText);
    }
  }

  // 3. Mapear cada una de las 16 posiciones (Módulo 1..4, Lectura 1..4)
  const items: SamReadingItem[] = [];

  for (let m = 1; m <= 4; m++) {
    for (let r = 1; r <= 4; r++) {
      const globalIndex = (m - 1) * 4 + r; // 1..16

      // Buscar URL por número de lectura global (ej: /L1/, /L2/, ..., /L16/)
      let targetUrl = effectiveUrls.find((u) => {
        const match = u.match(/\/L(\d+)\//i);
        return match ? Number(match[1]) === globalIndex : false;
      });

      // Si no coincide por /L{idx}/, tomar por índice secuencial si la cantidad coincide
      if (!targetUrl && effectiveUrls[globalIndex - 1]) {
        targetUrl = effectiveUrls[globalIndex - 1];
      }

      if (!targetUrl) continue;

      // Buscar título por anchor común (ej: lectura1m1, lectura2m1...)
      const commonAnchor = `lectura${r}m${m}`;
      let title = titlesByAnchor.get(commonAnchor) || titlesBySlot.get(`${m}-${r}`);

      // Si aún no tenemos título, buscar en el HTML por id
      if (!title) {
        const idRegex = new RegExp(`<[^>]+id=["']${commonAnchor}["'][^>]*>([\\s\\S]*?)<\\/`, "i");
        const idMatch = html.match(idRegex);
        if (idMatch) {
          title = cleanHtmlToMarkdown(idMatch[1]).trim();
        }
      }

      items.push({
        moduleNumber: m,
        readingNumber: r,
        globalIndex,
        title: title || `Lectura ${r}`,
        url: targetUrl,
      });
    }
  }

  return items;
}

/**
 * Obtiene el catálogo de lecturas de una materia usando caché o consultando Canvas.
 */
export async function getCourseSamCatalog(
  courseId: number,
  requestCanvasPage: (slug: string) => Promise<{ data: any }>
): Promise<SamReadingItem[]> {
  const cached = catalogCache.get(courseId);
  const now = Date.now();
  if (cached && now - cached.timestamp < CACHE_TTL_MS) {
    return cached.items;
  }

  let htmlBody = "";

  // 1. Intentar página de módulos
  try {
    const res = await requestCanvasPage(`courses/${courseId}/pages/modulos`);
    htmlBody = res.data?.body || "";
  } catch {
    // Si falla, intentar portada
  }

  // 2. Si no hubo resultados, intentar portada (front_page)
  if (!htmlBody || !htmlBody.includes("meca.ues21.edu.ar")) {
    try {
      const frontRes = await requestCanvasPage(`courses/${courseId}/front_page`);
      const frontBody = frontRes.data?.body || "";
      if (frontBody.includes("meca.ues21.edu.ar")) {
        htmlBody = frontBody;
      }
    } catch {
      // noop
    }
  }

  const catalog = extractSamCatalog(htmlBody);
  if (catalog.length > 0) {
    catalogCache.set(courseId, { items: catalog, timestamp: now });
  }

  return catalog;
}

/**
 * Descarga y extrae el texto en Markdown estructurado de una lectura SAM (meca.ues21.edu.ar).
 * Soporta paquetes interactivos Articulate Rise 360 (base64 courseData) y páginas HTML tradicionales.
 */
export async function fetchAndParseSamReading(rawUrl: string): Promise<SamReadingContent> {
  const cleanUrl = rawUrl.split("#")[0].trim();

  // Verificar caché
  const cached = contentCache.get(cleanUrl);
  const now = Date.now();
  if (cached && now - cached.timestamp < CACHE_TTL_MS) {
    return cached.content;
  }

  const res = await fetch(cleanUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
  });

  if (!res.ok) {
    throw new Error(`Error al conectar con SAM (HTTP ${res.status}): ${res.statusText}`);
  }

  const html = await res.text();

  // Caso 1: Articulate Rise 360 con payload courseData en Base64
  const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)];
  for (const s of scripts) {
    const sText = s[1];
    // Buscar cadena Base64 larga representativa del curso Rise
    const b64Match = sText.match(/["']([A-Za-z0-9+/=]{2000,})["']/);
    if (b64Match) {
      try {
        const decoded = Buffer.from(b64Match[1], "base64").toString("utf-8");
        if (decoded.includes('"lessons"') || decoded.includes('"course"')) {
          const json = JSON.parse(decoded);
          const courseObj = json.course || json;
          const courseTitle = courseObj.title || json.title || "Lectura";
          const lessons = courseObj.lessons || json.lessons || [];

          let fullMarkdown = `# ${courseTitle}\n\n`;

          for (const lesson of lessons) {
            // Omitir lección de descarga de PDF para quedarnos solo con el contenido formativo
            if (/descarga en pdf/i.test(lesson.title)) continue;

            fullMarkdown += `## ${lesson.title}\n\n`;

            for (const item of lesson.items || []) {
              if (item.heading) {
                const h = cleanHtmlToMarkdown(item.heading).trim();
                if (h && !/^(?:T[ií]tulo|Subt[ií]tulo)?\s*\([^)]*Fuente[^)]*\)$/i.test(h)) {
                  fullMarkdown += `### ${h}\n\n`;
                }
              }
              if (item.paragraph) {
                const p = cleanHtmlToMarkdown(item.paragraph).trim();
                if (p) fullMarkdown += `${p}\n\n`;
              }

              if (Array.isArray(item.items)) {
                for (const sub of item.items) {
                  if (sub.heading) {
                    const sh = cleanHtmlToMarkdown(sub.heading).trim();
                    if (sh && !/^(?:T[ií]tulo|Subt[ií]tulo)?\s*\([^)]*Fuente[^)]*\)$/i.test(sh)) {
                      fullMarkdown += `### ${sh}\n\n`;
                    }
                  }
                  if (sub.paragraph) {
                    const sp = cleanHtmlToMarkdown(sub.paragraph).trim();
                    if (sp) fullMarkdown += `${sp}\n\n`;
                  }
                  if (sub.description) {
                    const sd = cleanHtmlToMarkdown(sub.description).trim();
                    if (sd) fullMarkdown += `${sd}\n\n`;
                  }
                  if (sub.title) {
                    const st = cleanHtmlToMarkdown(sub.title).trim();
                    if (st) fullMarkdown += `**${st}**\n\n`;
                  }
                }
              }
            }
          }

          // Limpiar exceso de saltos de línea
          fullMarkdown = fullMarkdown.replace(/\n{3,}/g, "\n\n").trim();

          const result: SamReadingContent = {
            title: courseTitle,
            markdown: fullMarkdown,
            url: rawUrl,
            sourceType: "rise",
            charCount: fullMarkdown.length,
          };

          contentCache.set(cleanUrl, { content: result, timestamp: now });
          return result;
        }
      } catch {
        // Continuar si este script no era JSON válido
      }
    }
  }

  // Caso 2: HTML estándar estructurado de SAM
  const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
  const parsedTitle = titleMatch ? titleMatch[1].trim() : "Lectura";
  const bodyMarkdown = cleanHtmlToMarkdown(html);

  const result: SamReadingContent = {
    title: parsedTitle,
    markdown: bodyMarkdown,
    url: rawUrl,
    sourceType: "html",
    charCount: bodyMarkdown.length,
  };

  contentCache.set(cleanUrl, { content: result, timestamp: now });
  return result;
}
