import { CanvasClient } from "./src/canvasClient.js";
import fs from "fs";
import os from "os";
import path from "path";

function getCreds() {
  const configPath = path.join(os.homedir(), ".gemini", "antigravity", "mcp_config.json");
  const parsed = JSON.parse(fs.readFileSync(configPath, "utf-8"));
  return {
    url: parsed.mcpServers.siglo21.env.CANVAS_URL,
    token: parsed.mcpServers.siglo21.env.CANVAS_TOKEN
  };
}

const { url, token } = getCreds();
const client = new CanvasClient({ baseUrl: url, token });

async function main() {
  const courseId = 42833; // Algoritmos II
  console.log("=== Checking modules ===");
  const modules = await client.getAllPages(`courses/${courseId}/modules?include[]=items&per_page=100`);
  console.log("Modules count:", modules.length);
  for (const m of modules) {
    console.log("Module:", m.name, "Items:", m.items?.length);
    for (const it of m.items || []) {
      console.log("  - Item:", it.title, "| Type:", it.type, "| URL:", it.url || it.page_url);
    }
  }

  console.log("\n=== Checking pages ===");
  try {
    const pages = await client.getAllPages(`courses/${courseId}/pages?per_page=100`);
    console.log("Pages count:", pages.length);
    for (const p of pages.slice(0, 10)) {
      console.log("  - Page:", p.title, "| url:", p.url);
    }
  } catch (err) {
    console.log("Pages failed:", err.message);
  }

  console.log("\n=== Checking course 41000 modules ===");
  const mod41 = await client.getAllPages(`courses/41000/modules?include[]=items&per_page=100`);
  for (const m of mod41) {
    console.log("Module:", m.name, "Items:", m.items?.length);
    for (const it of m.items || []) {
      console.log("  - Item:", it.title, "| Type:", it.type);
    }
  }

  console.log("\n=== Checking course 38697 (Algebra) modules ===");
  const mod38 = await client.getAllPages(`courses/38697/modules?include[]=items&per_page=100`);
  for (const m of mod38) {
    console.log("Module:", m.name, "Items:", m.items?.length);
    for (const it of m.items || []) {
      console.log("  - Item:", it.title, "| Type:", it.type);
    }
  }
}

main().catch(console.error);
