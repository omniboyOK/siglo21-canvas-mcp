import { startExamSimulatorServer } from "../dist/server/portalServer.js";

async function main() {
  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 42122;
  const autoOpen = !process.argv.includes("--no-open") && process.env.AUTO_OPEN !== "false";
  
  // Buscar tab inicial si se especifica
  const tabArg = process.argv.slice(2).find((a) => !a.startsWith("--"));
  const tab = tabArg === "mcp" || tabArg === "simulator" ? tabArg : "home";
  
  console.log(`\n[S21 Portal] Iniciando servidor en puerto ${port}...`);
  try {
    const res = await startExamSimulatorServer(port, autoOpen, tab);
    console.log(`[S21 Portal] Backend API activo en: http://localhost:${port}`);
    if (!autoOpen) {
      console.log(`[S21 Portal] Modo desarrollo (sin abrir navegador automáticamente).`);
      console.log(`[S21 Portal] Puedes usar Vite en http://localhost:5173 para Hot-Reload.\n`);
    } else {
      console.log(`[S21 Portal] Servidor activo en: ${res.url}`);
    }
    console.log(`[S21 Portal] Presiona Ctrl+C para detener el servidor.\n`);
  } catch (err) {
    console.error("[S21 Portal] Error iniciando servidor:", err);
    process.exit(1);
  }
}

main();
