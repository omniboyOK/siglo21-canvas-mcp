/**
 * Tipos base y helpers para el sistema de herramientas MCP.
 *
 * Cada tool se define como un ToolDefinition, permitiendo registro dinámico
 * y un solo archivo por herramienta.
 */

import type { CanvasClient } from "../canvas/client.js";

/** Contexto inyectado a cada handler de tool */
export interface ToolContext {
  client: CanvasClient;
  hasToken: boolean;
}

/** Respuesta estándar de un tool MCP */
export interface ToolResponse {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

/** Definición completa de una herramienta MCP */
export interface ToolDefinition {
  /** Nombre único del tool (ej: "s21_list_courses") */
  name: string;

  /** Descripción para el LLM */
  description: string;

  /** JSON Schema del input */
  inputSchema: Record<string, unknown>;

  /**
   * Si true, el handler NO requiere un CANVAS_TOKEN válido
   * (ej: tools que solo usan SQLite local).
   */
  requiresAuth?: boolean;

  /** Implementación del tool */
  handler: (
    args: Record<string, unknown>,
    ctx: ToolContext
  ) => Promise<ToolResponse>;
}

/** Helper para crear una respuesta de texto exitosa */
export function textResponse(text: string): ToolResponse {
  return { content: [{ type: "text", text }] };
}

/** Helper para crear una respuesta JSON exitosa */
export function jsonResponse(data: unknown): ToolResponse {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

/** Helper para crear una respuesta de error */
export function errorResponse(message: string): ToolResponse {
  return {
    isError: true,
    content: [{ type: "text", text: message }],
  };
}
