import type { ToolDefinition } from "../_base.js";
import { jsonResponse } from "../_base.js";
import { ModulesSchema } from "../schemas.js";
import { getModules } from "../../canvas/content.service.js";

export const modulesTool: ToolDefinition = {
  name: "s21_get_modules",
  description:
    "Obtiene la estructura de módulos (SAM), lecturas y actividades organizadas por unidad temática.",
  inputSchema: {
    type: "object",
    properties: {
      course_id: { type: "number", description: "ID de la materia en Canvas." },
      clean_content: { type: "boolean", description: "Si es true (por defecto), reduce el payload limpiando metadatos redundantes." },
    },
    required: ["course_id"],
  },
  requiresAuth: true,
  handler: async (args, ctx) => {
    const parsed = ModulesSchema.parse(args);
    const data = await getModules(ctx.client, parsed.course_id, parsed.clean_content !== false);
    return jsonResponse(data);
  },
};
