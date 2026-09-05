import { exec } from "node:child_process";

/**
 * Abre la interfaz en una ventana de escritorio independiente (App Mode),
 * ocultando la barra de direcciones de localhost, pestañas y botones del navegador.
 */
export function openAppWindow(
  url: string,
  width: number = 1360,
  height: number = 860
): void {
  const platform = process.platform;

  if (platform === "win32") {
    // Windows: Usar Microsoft Edge en modo App (--app) preinstalado en el 100% de Win 10/11
    const edgeCmd = `start msedge --app="${url}" --window-size=${width},${height}`;
    exec(edgeCmd, (err) => {
      if (err) {
        // Fallback a Google Chrome en modo App
        const chromeCmd = `start chrome --app="${url}" --window-size=${width},${height}`;
        exec(chromeCmd, (chromeErr) => {
          if (chromeErr) {
            // Fallback final a navegador por defecto
            exec(`start "" "${url}"`);
          }
        });
      }
    });
  } else if (platform === "darwin") {
    // macOS: Intentar Chrome en modo app o Safari/default
    const macCmd = `open -a "Google Chrome" --args --app="${url}"`;
    exec(macCmd, (err) => {
      if (err) exec(`open "${url}"`);
    });
  } else {
    // Linux
    const linuxCmd = `google-chrome --app="${url}"`;
    exec(linuxCmd, (err) => {
      if (err) exec(`xdg-open "${url}"`);
    });
  }
}
