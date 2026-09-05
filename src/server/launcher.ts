import { execFile } from "node:child_process";
import { URL } from "node:url";

/**
 * Abre la interfaz en una ventana de escritorio independiente (App Mode),
 * ocultando la barra de direcciones de localhost, pestañas y botones del navegador.
 */
export function openAppWindow(
  url: string,
  width: number = 1360,
  height: number = 860
): void {
  // 1. Validar estrictamente la URL para prevenir Command Injection
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      console.error("[Launcher] Protocolo no permitido:", parsed.protocol);
      return;
    }
    if (parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1") {
      console.error("[Launcher] Hostname no permitido:", parsed.hostname);
      return;
    }
  } catch {
    console.error("[Launcher] URL inválida:", url);
    return;
  }

  // 2. Sanitizar dimensiones
  const safeWidth = Math.min(Math.max(Math.floor(Number(width) || 1360), 400), 3840);
  const safeHeight = Math.min(Math.max(Math.floor(Number(height) || 860), 300), 2160);
  const platform = process.platform;

  if (platform === "win32") {
    // Windows: Usar Microsoft Edge en modo App (--app) preinstalado en Win 10/11
    execFile(
      "cmd.exe",
      ["/c", "start", "", "msedge", `--app=${url}`, `--window-size=${safeWidth},${safeHeight}`],
      (err) => {
        if (err) {
          // Fallback a Google Chrome en modo App
          execFile(
            "cmd.exe",
            ["/c", "start", "", "chrome", `--app=${url}`, `--window-size=${safeWidth},${safeHeight}`],
            (chromeErr) => {
              if (chromeErr) {
                // Fallback final a navegador por defecto
                execFile("cmd.exe", ["/c", "start", "", url]);
              }
            }
          );
        }
      }
    );
  } else if (platform === "darwin") {
    // macOS: Intentar Chrome en modo app o Safari/default
    execFile("open", ["-a", "Google Chrome", "--args", `--app=${url}`], (err) => {
      if (err) {
        execFile("open", [url]);
      }
    });
  } else {
    // Linux
    execFile("google-chrome", [`--app=${url}`], (err) => {
      if (err) {
        execFile("xdg-open", [url]);
      }
    });
  }
}

