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

  // 9. Decodificar entidades HTML comunes
  text = text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");

  // 10. Limpiar asteriscos y espacios huérfanos generados por tags vacíos
  text = text.replace(/\*\*\s*\*\*/g, "");
  text = text.replace(/\*\s*\*/g, "");

  // 11. Normalizar saltos de línea y espacios
  const lines = text
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter((line) => line.length > 0);

  return lines.join("\n\n").trim();
}
