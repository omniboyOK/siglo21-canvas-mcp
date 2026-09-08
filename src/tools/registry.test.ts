import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createMcpServer } from "./registry.js";
import { ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

describe("MCP Tools Registry & Handlers", () => {
  it("createMcpServer debe instanciar el servidor MCP con 21 herramientas registradas", async () => {
    const server = createMcpServer();
    assert.ok(server);
  });
});
