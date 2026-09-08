import type { ToolDefinition } from "../_base.js";
import { jsonResponse } from "../_base.js";
import { SearchReadingsSchema } from "../schemas.js";
import { searchLocalReadings } from "../../storage/search.js";

export const searchReadingsTool: ToolDefinition = {
  name: "s21_search_readings",
  description:
    "Realiza una búsqueda transversal de conceptos o palabras clave en todas las lecturas y PDFs descargados del alumno.",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Término, tema o concepto a buscar (ej: 'algoritmo de euclides', 'derivada', 'árbol binario')." },
    },
    required: ["query"],
  },
  requiresAuth: false,
  handler: async (args) => {
    const parsed = SearchReadingsSchema.parse(args);
    const data = await searchLocalReadings(parsed.query);
    return jsonResponse(data);
  },
};
