import type { ToolDefinition } from "../_base.js";
import { jsonResponse } from "../_base.js";
import { ListCoursesSchema } from "../schemas.js";
import { getCourses } from "../../canvas/courses.service.js";

export const listCoursesTool: ToolDefinition = {
  name: "s21_list_courses",
  description:
    "Lista las materias del alumno (activas o históricas) con soporte de búsqueda y formato compacto optimizado.",
  inputSchema: {
    type: "object",
    properties: {
      include_concluded: {
        type: "boolean",
        description:
          "Si es true, incluye materias finalizadas/pasadas. Por defecto false (solo materias activas).",
      },
      search: {
        type: "string",
        description:
          "Término opcional para filtrar por nombre o código de materia (ej: 'matematica', 'programacion', 'CEX332').",
      },
      compact: {
        type: "boolean",
        description:
          "Si es true (por defecto), devuelve solo los campos clave (id, nombre, código, período, notas).",
      },
    },
  },
  requiresAuth: true,
  handler: async (args, ctx) => {
    const parsed = ListCoursesSchema.parse(args);
    const data = await getCourses(ctx.client, {
      includeConcluded: parsed.include_concluded,
      search: parsed.search,
      compact: parsed.compact,
    });
    return jsonResponse(data);
  },
};
