import type { ToolDefinition } from "../_base.js";
import { jsonResponse } from "../_base.js";
import { getSelf } from "../../canvas/courses.service.js";

export const profileTool: ToolDefinition = {
  name: "s21_get_my_profile",
  description:
    "Obtiene el perfil del alumno en Siglo 21 Canvas (nombre, id, correo, avatar).",
  inputSchema: {
    type: "object",
    properties: {},
  },
  requiresAuth: true,
  handler: async (_args, ctx) => {
    const data = await getSelf(ctx.client);
    return jsonResponse(data);
  },
};
