/**
 * Búsqueda transversal de conceptos en lecturas y PDFs locales.
 *
 * Extraído de CanvasClient.searchLocalReadings() porque NO usa la API de Canvas,
 * solo opera sobre el filesystem local.
 */

import fs from "node:fs";
import path from "node:path";

export async function searchLocalReadings(
  query: string,
  baseDir = "descargas"
) {
  const results: Array<{
    file_path: string;
    filename: string;
    snippet: string;
  }> = [];
  const normalizedQuery = query
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  const cwd = process.cwd();
  // Sanitizar baseDir para prevenir path traversal arbitrario
  const sanitizedBase = path.normalize(baseDir).replace(/^(\.\.[\\/])+/, "");
  let searchDir = path.resolve(cwd, sanitizedBase);

  // Solo permitir directorios dentro de cwd o del directorio del proyecto
  if (!searchDir.startsWith(cwd)) {
    return {
      query,
      message: `Directorio '${baseDir}' fuera del ámbito permitido.`,
      results: [],
    };
  }

  if (!fs.existsSync(searchDir)) {
    const parentDir = path.resolve(cwd, "..", sanitizedBase);
    if (
      fs.existsSync(parentDir) &&
      path.basename(parentDir) === path.basename(sanitizedBase)
    ) {
      searchDir = parentDir;
    } else {
      return {
        query,
        message: `El directorio local '${baseDir}' no existe o no contiene archivos descargados todavía.`,
        results: [],
      };
    }
  }

  function walkSync(dir: string, fileList: string[] = []) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const fullPath = path.join(dir, file);
      if (fs.statSync(fullPath).isDirectory()) {
        walkSync(fullPath, fileList);
      } else if (
        file.toLowerCase().endsWith(".pdf") ||
        file.toLowerCase().endsWith(".txt") ||
        file.toLowerCase().endsWith(".md")
      ) {
        fileList.push(fullPath);
      }
    }
    return fileList;
  }

  const allFiles = walkSync(searchDir);

  for (const filePath of allFiles) {
    try {
      if (
        filePath.toLowerCase().endsWith(".txt") ||
        filePath.toLowerCase().endsWith(".md")
      ) {
        const content = fs.readFileSync(filePath, "utf8");
        const normContent = content
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "");
        const matchIdx = normContent.indexOf(normalizedQuery);
        if (matchIdx !== -1) {
          const start = Math.max(0, matchIdx - 150);
          const end = Math.min(
            content.length,
            matchIdx + query.length + 150
          );
          results.push({
            file_path: filePath,
            filename: path.basename(filePath),
            snippet: `...${content.slice(start, end).replace(/\s+/g, " ")}...`,
          });
        }
      } else if (filePath.toLowerCase().endsWith(".pdf")) {
        // Búsqueda en PDF local
        const dataBuffer = fs.readFileSync(filePath);
        const { extractPdfTextFromBuffer } = await import("../pdfReader.js");
        const pdfData = await extractPdfTextFromBuffer(dataBuffer, 10);
        const normContent = pdfData.text
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "");
        const matchIdx = normContent.indexOf(normalizedQuery);
        if (matchIdx !== -1) {
          const start = Math.max(0, matchIdx - 150);
          const end = Math.min(
            pdfData.text.length,
            matchIdx + query.length + 150
          );
          results.push({
            file_path: filePath,
            filename: path.basename(filePath),
            snippet: `...${pdfData.text.slice(start, end).replace(/\s+/g, " ")}...`,
          });
        }
      }
    } catch {
      // Continuar con los demás archivos
    }
  }

  return {
    query,
    found_count: results.length,
    results,
  };
}
