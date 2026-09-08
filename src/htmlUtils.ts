/**
 * Limpia y convierte HTML de Canvas a Markdown legible, eliminando scripts, estilos,
 * atributos pesados (JWTs) y preservando enlaces a archivos y texto formateado.
 */
export function cleanHtmlToMarkdown(html: string | null | undefined): string {
  if (!html || typeof html !== "string") return "";

  let text = html;

  // 1. Eliminar scripts, estilos, iframes y elementos no deseados
  text = text.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");
  text = text.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "");
  text = text.replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, "");

  // 2. Extraer enlaces significativos con sus textos: <a href="url">Texto</a> -> [Texto](url)
  text = text.replace(/<a\b[^>]*href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gi, (match, url, linkText) => {
    const cleanLinkText = linkText.replace(/<[^>]+>/g, "").trim();
    if (!cleanLinkText || cleanLinkText === "&nbsp;") return "";
    return ` [${cleanLinkText}](${url}) `;
  });

  // 3. Eliminar imágenes decorativas o líneas gráficas
  text = text.replace(/<img\b[^>]*>/gi, "");

  // 4. Convertir encabezados
  text = text.replace(/<h1[^>]*>(.*?)<\/h1>/gi, "\n\n# $1\n\n");
  text = text.replace(/<h2[^>]*>(.*?)<\/h2>/gi, "\n\n## $1\n\n");
  text = text.replace(/<h3[^>]*>(.*?)<\/h3>/gi, "\n\n### $1\n\n");
  text = text.replace(/<h[4-6][^>]*>(.*?)<\/h[4-6]>/gi, "\n\n#### $1\n\n");

  // 5. Convertir listas
  text = text.replace(/<li[^>]*>(.*?)<\/li>/gi, "\n- $1");
  text = text.replace(/<\/ul>|<\/ol>/gi, "\n\n");

  // 6. Convertir negritas, cursivas y párrafos
  text = text.replace(/<strong[^>]*>|<\/strong>|<b[^>]*>|<\/b>/gi, "**");
  text = text.replace(/<em[^>]*>|<\/em>|<i[^>]*>|<\/i>/gi, "*");
  text = text.replace(/<p[^>]*>/gi, "\n");
  text = text.replace(/<\/p>/gi, "\n");
  text = text.replace(/<br\s*[\/]?>/gi, "\n");

  // 7. Limpiar tablas vacías o decorativas
  text = text.replace(/<td[^>]*>\s*<\/td>/gi, "");
  text = text.replace(/<tr[^>]*>\s*<\/tr>/gi, "");
  text = text.replace(/<td[^>]*>|<th[^>]*>/gi, " ");
  text = text.replace(/<\/tr>|<\/td>|<\/th>|<tbody[^>]*>|<\/tbody>|<table[^>]*>|<\/table>/gi, "\n");

  // 8. Eliminar cualquier etiqueta HTML remanente
  text = text.replace(/<[^>]+>/g, " ");

  // 9. Decodificar entidades HTML completas (acentos, español, símbolos matemáticos, lógicos y numéricos)
  text = decodeHtmlEntities(text);

  // 10. Limpieza de artefactos de plantilla de diseño instruccional (Siglo 21 / Rise 360)
  // Ej: "### Título (Fuente Roboto, tamaño 34, color #009681, justificado)"
  text = text.replace(/(?:^|\n)#{1,6}\s*(?:T[ií]tulo|Subt[ií]tulo)?\s*\([^)]*Fuente[^)]*\)(?:\n|$)/gi, "\n");
  text = text.replace(/\s*\([^)]*Fuente\s+Roboto[^)]*\)/gi, "");

  // 11. Limpiar asteriscos y espacios huérfanos generados por tags vacíos
  text = text.replace(/\*\*\s*\*\*/g, "");
  text = text.replace(/\*\s*\*/g, "");

  // 12. Normalizar saltos de línea y espacios
  const lines = text
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter((line) => line.length > 0);

  return lines.join("\n\n").trim();
}

const HTML_ENTITIES: Record<string, string> = {
  // Básicas
  nbsp: " ",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",

  // Español y acentos
  aacute: "á", Aacute: "Á",
  eacute: "é", Eacute: "É",
  iacute: "í", Iacute: "Í",
  oacute: "ó", Oacute: "Ó",
  uacute: "ú", Uacute: "Ú",
  ntilde: "ñ", Ntilde: "Ñ",
  uuml: "ü", Uuml: "Ü",
  iexcl: "¡",
  iquest: "¿",
  ordf: "ª",
  ordm: "º",

  // Símbolos matemáticos, lógicos y de conjuntos
  isin: "∈",
  notin: "∉",
  ni: "∋",
  empty: "∅",
  forall: "∀",
  exist: "∃",
  exists: "∃",
  nexist: "∄",
  sub: "⊂",
  subset: "⊂",
  sube: "⊆",
  subseteq: "⊆",
  nsub: "⊄",
  sup: "⊃",
  supset: "⊃",
  supe: "⊇",
  supseteq: "⊇",
  cup: "∪",
  cap: "∩",
  le: "≤",
  ge: "≥",
  ne: "≠",
  equiv: "≡",
  plusmn: "±",
  times: "×",
  divide: "÷",
  infin: "∞",
  radic: "√",
  sim: "∼",
  cong: "≅",
  asymp: "≈",
  prop: "∝",
  and: "∧",
  or: "∨",
  not: "¬",
  rArr: "⇒",
  implies: "⇒",
  hArr: "⇔",
  iff: "⇔",
  rarr: "→",
  larr: "←",
  harr: "↔",
  prime: "′",
  Prime: "″",

  // Letras griegas
  alpha: "α", Alpha: "Α",
  beta: "β", Beta: "Β",
  gamma: "γ", Gamma: "Γ",
  delta: "δ", Delta: "Δ",
  epsilon: "ε", Epsilon: "Ε",
  zeta: "ζ", Zeta: "Ζ",
  eta: "η", Eta: "Η",
  theta: "θ", Theta: "Θ",
  iota: "ι", Iota: "Ι",
  kappa: "κ", Kappa: "Κ",
  lambda: "λ", Lambda: "Λ",
  mu: "μ", Mu: "Μ",
  nu: "ν", Nu: "Ν",
  xi: "ξ", Xi: "Ξ",
  pi: "π", Pi: "Π",
  rho: "ρ", Rho: "Ρ",
  sigma: "σ", Sigma: "Σ",
  tau: "τ", Tau: "Τ",
  phi: "φ", Phi: "Φ",
  chi: "χ", Chi: "Χ",
  psi: "ψ", Psi: "Ψ",
  omega: "ω", Omega: "Ω",

  // Tipografía y signos
  mdash: "—",
  ndash: "–",
  ldquo: "“",
  rdquo: "”",
  lsquo: "‘",
  rsquo: "’",
  laquo: "«",
  raquo: "»",
  bull: "•",
  hellip: "…",
  copy: "©",
  reg: "®",
  trade: "™",
  deg: "°",
  sect: "§",
  para: "¶",
  middot: "·",
};

/**
 * Decodifica entidades HTML nombradas, decimales (&#160;) y hexadecimales (&#xA0;).
 */
export function decodeHtmlEntities(text: string): string {
  if (!text) return "";

  return text
    // 1. Entidades numéricas decimales
    .replace(/&#(\d+);/g, (_, dec) => {
      try {
        return String.fromCodePoint(Number(dec));
      } catch {
        return "";
      }
    })
    // 2. Entidades numéricas hexadecimales
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
      try {
        return String.fromCodePoint(parseInt(hex, 16));
      } catch {
        return "";
      }
    })
    // 3. Entidades con nombre
    .replace(/&([a-zA-Z]+);/g, (match, entityName) => {
      return HTML_ENTITIES[entityName] !== undefined
        ? HTML_ENTITIES[entityName]
        : match;
    });
}
