# s21-canvas-mcp

Servidor **Model Context Protocol (MCP)** para integrar asistentes de inteligencia artificial (Claude Desktop, Cursor, Antigravity, Windsurf, VS Code Copilot, Codex CLI) con la plataforma **Canvas LMS de la Universidad Siglo 21**.

Proporciona capacidades para consultar asignaturas, calificaciones, trabajos prácticos, cronogramas, extraer en memoria o descargar en disco el PDF original de lecturas y documentos, y utilizar el portal local unificado con simulador de exámenes y banco de preguntas en SQLite.

**Requisitos**: Node.js `>= 22.0.0` (requerido por `node:sqlite`).

---

## Instalación

Seleccione la configuración correspondiente a su entorno o cliente de IA. Es necesario contar con un token de acceso personal o una cookie de sesión de Canvas LMS (consulte las instrucciones en [Autenticación (Token de API o Cookie de Sesión)](#autenticación-token-de-api-o-cookie-de-sesión)).

### 1. Claude Desktop

Ruta del archivo de configuración:
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "siglo21": {
      "command": "npx",
      "args": ["-y", "s21-canvas-mcp"],
      "env": {
        "CANVAS_TOKEN": "tu_token_de_canvas_aqui",
        "CANVAS_URL": "https://siglo21.instructure.com"
      }
    }
  }
}
```

### 2. Antigravity (Gemini)

Archivo: `.gemini/settings.json` en el workspace (o configuración global en `~/.gemini/settings.json`)

```json
{
  "mcpServers": {
    "siglo21": {
      "command": "npx",
      "args": ["-y", "s21-canvas-mcp"],
      "env": {
        "CANVAS_TOKEN": "tu_token_de_canvas_aqui",
        "CANVAS_URL": "https://siglo21.instructure.com"
      }
    }
  }
}
```

### 3. Cursor

Archivo: `.cursor/mcp.json` en el workspace

```json
{
  "mcpServers": {
    "siglo21": {
      "command": "npx",
      "args": ["-y", "s21-canvas-mcp"],
      "env": {
        "CANVAS_TOKEN": "tu_token_de_canvas_aqui",
        "CANVAS_URL": "https://siglo21.instructure.com"
      }
    }
  }
}
```

### 4. VS Code Copilot

Archivo: `.vscode/settings.json` en el workspace

> **Nota**: Visual Studio Code emplea una clave específica (`mcp.servers` en lugar de `mcpServers`).

```json
{
  "mcp": {
    "servers": {
      "siglo21": {
        "command": "npx",
        "args": ["-y", "s21-canvas-mcp"],
        "env": {
          "CANVAS_TOKEN": "tu_token_de_canvas_aqui",
          "CANVAS_URL": "https://siglo21.instructure.com"
        }
      }
    }
  }
}
```

### 5. Windsurf

Archivo: `~/.codeium/windsurf/mcp_config.json`

```json
{
  "mcpServers": {
    "siglo21": {
      "command": "npx",
      "args": ["-y", "s21-canvas-mcp"],
      "env": {
        "CANVAS_TOKEN": "tu_token_de_canvas_aqui",
        "CANVAS_URL": "https://siglo21.instructure.com"
      }
    }
  }
}
```

### 6. Codex CLI (OpenAI)

Archivo: `~/.codex/config.json`

```json
{
  "mcpServers": {
    "siglo21": {
      "command": "npx",
      "args": ["-y", "s21-canvas-mcp"],
      "env": {
        "CANVAS_TOKEN": "tu_token_de_canvas_aqui",
        "CANVAS_URL": "https://siglo21.instructure.com"
      }
    }
  }
}
```

---

## Autenticación (Token de API o Cookie de Sesión)

El servidor soporta dos métodos de autenticación:

### Método A: Token de Acceso Personal (`CANVAS_TOKEN`)
*(Recomendado si tu cuenta tiene la opción disponible)*

1. Inicie sesión en [Canvas Siglo 21](https://siglo21.instructure.com).
2. Diríjase a [Cuenta > Configuración](https://siglo21.instructure.com/profile/settings).
3. Desplácese hasta la sección **Tokens de acceso aprobados** y seleccione **+ Nuevo token de acceso**.
4. Ingrese un nombre identificador (ej: `MCP-Agent`) y seleccione **Generar token**.
5. Copie el token generado y configúrelo en `CANVAS_TOKEN`.

### Método B: Cookie de Sesión Web (`CANVAS_SESSION` / `CANVAS_COOKIE`)
*(Ideal si la Universidad Siglo 21 tiene bloqueada la generación de tokens para alumnos)*

Si el botón de nuevo token no aparece o está inhabilitado, puedes autenticarte con tu sesión activa del navegador:

1. Inicie sesión en [Canvas Siglo 21](https://siglo21.instructure.com) en su navegador (Chrome, Edge o Firefox).
2. Abra las Herramientas de Desarrollador (**F12** o clic derecho > *Inspeccionar*).
3. Diríjase a la pestaña **Application** (o *Almacenamiento*):
   - En la barra lateral izquierda, expanda **Cookies** y seleccione `https://siglo21.instructure.com`.
   - Copie el valor de la cookie **`canvas_session`**.
   - *(Opcional)* Copie también el valor de **`_csrf_token`**.
4. También puede copiar toda la cabecera `Cookie:` desde la pestaña **Network** (Headers > Request Headers > Cookie).
5. Asigne los valores en su configuración:
   - `CANVAS_SESSION` o `CANVAS_COOKIE`: el valor de `canvas_session` o la cadena completa de cookies.
   - `CANVAS_CSRF_TOKEN`: el valor de `_csrf_token`.

Ejemplo de configuración usando cookie de sesión:

```json
{
  "mcpServers": {
    "siglo21": {
      "command": "npx",
      "args": ["-y", "s21-canvas-mcp"],
      "env": {
        "CANVAS_URL": "https://siglo21.instructure.com",
        "CANVAS_SESSION": "tu_cookie_canvas_session_aqui",
        "CANVAS_CSRF_TOKEN": "tu_csrf_token_opcional"
      }
    }
  }
}
```

### Variables de entorno opcionales

- `CANVAS_URL`: URL base de la instancia de Canvas LMS (por defecto `https://siglo21.instructure.com`).
- `S21_DB_PATH`: ruta personalizada para la base de datos SQLite del banco de preguntas y simulacros (por defecto `data/exams.db`).
- `S21_COURSES_DIR`: directorio raíz para guardar lecturas y archivos descargados (por defecto `data/courses`).
- `S21_DISABLE_CONFIG_FALLBACK`: definir como `1` o `true` para desactivar la lectura automática de respaldo desde `~/.gemini/*/mcp_config.json`.

> [!WARNING]
> **Seguridad de credenciales**: No comparta sus credenciales ni cookies con nadie, ya que otorgan acceso a su información académica. Las cookies de sesión expiran periódicamente según las políticas del navegador y la universidad, por lo que si el servidor devuelve error de autenticación en el futuro, solo deberá renovar la cookie en su archivo de configuración.

> [!NOTE]
> **Endurecimiento local**: El portal web local escucha únicamente en `127.0.0.1` con CORS restringido a orígenes locales explícitos (`localhost`, `127.0.0.1`, `[::1]`, webviews/app), y las descargas HTTP salientes validan HTTPS y redirecciones para prevenir SSRF y evitar el reenvío de credenciales fuera del dominio de Canvas.

---

## Herramientas Disponibles

| Herramienta | Descripción | Parámetros |
| :--- | :--- | :--- |
| `s21_open_interactive_portal` | Portal web interactivo unificado con bienvenida, métricas académicas, catálogo de herramientas y generador de prompts. | `port` (opcional), `auto_open` (opcional) |
| `s21_open_exam_simulator` | Abre el portal local directo en el simulador de exámenes con persistencia en SQLite, temporizador y modos `exam`/`practice`. | `port`, `auto_open`, `course_id`, `mode`, `start_exam` (todos opcionales) |
| `s21_save_questions_to_bank` | Guarda un lote de preguntas de examen en SQLite local categorizadas por materia, módulo y lectura. | `course_id`, `course_name`, `questions` |
| `s21_get_bank_questions` | Consulta las preguntas guardadas en el banco local SQLite para una materia, con filtro opcional por módulo y límite. | `course_id`, `module_number` (opcional), `limit` (opcional) |
| `s21_get_exam_bank_summary` | Resumen del banco de preguntas y estadísticas históricas de intentos en SQLite local. | - |
| `s21_check_academic_status` | Calcula el promedio actual y notas mínimas proyectadas para Promoción Directa (7+) o Regularidad (5+). | `course_id`, `target_promo_grade` (opcional), `target_regular_grade` (opcional) |
| `s21_generate_practice_quiz` | Genera preguntas multiple choice con fundamentación teórica basadas en una lectura oficial de Canvas. | `course_id`, `module_number`, `reading_number`, `question_count` (opcional) |
| `s21_audit_rubric` | Compara el borrador de un Trabajo Práctico contra la rúbrica oficial de Canvas y evalúa el puntaje por criterio. | `course_id`, `assignment_id`, `draft_text` |
| `s21_get_pending_tasks` | Lista cronológica de entregas y TPs pendientes en todas las materias activas con días restantes. | - |
| `s21_get_reading` | Localiza una lectura o actividad SAM/Canvas (módulo 1–4, lectura 1–4) y opcionalmente extrae el texto del PDF. | `course_id`, `module_number`, `reading_number`, `auto_read_pdf` (opcional) |
| `s21_get_reading_pdf` | Descarga y guarda en disco el archivo PDF (`.pdf`) original completo de una lectura SAM o Canvas sin convertirlo a Markdown. | `course_id`, `module_number`, `reading_number`, `output_dir` (opcional) |
| `s21_read_pdf_content` | Descarga en memoria y extrae el texto completo de un documento PDF de Canvas sin guardarlo en disco. | `file_id` o `download_url`, `max_pages` (opcional) |
| `s21_search_readings` | Búsqueda transversal por conceptos o palabras clave en las lecturas y PDFs descargados localmente. | `query` |
| `s21_list_courses` | Lista las materias activas o concluidas con soporte de búsqueda y formato compacto. | `include_concluded` (opcional), `search` (opcional), `compact` (opcional) |
| `s21_get_assignments` | Obtiene consignas de Trabajos Prácticos (TP1 a TP4), fechas límite y rúbricas en Markdown. | `course_id`, `clean_content` (opcional) |
| `s21_get_modules` | Estructura completa de módulos SAM, lecturas y actividades organizadas por unidad temática. | `course_id`, `clean_content` (opcional) |
| `s21_get_course_files` | Lista los archivos y documentos descargables de una asignatura (con fallback si la pestaña de archivos está restringida). | `course_id` |
| `s21_get_discussion_topics` | Consignas de foros de debate y actividades grupales (incluyendo foros de TP2). | `course_id` |
| `s21_get_syllabus` | Programa oficial de la asignatura, criterios de evaluación y datos del cuerpo docente. | `course_id` |
| `s21_get_upcoming_events` | Próximos eventos, entregas y fechas clave del calendario institucional. | - |
| `s21_get_announcements` | Anuncios y avisos publicados por docentes y tutores en formato Markdown limpio. | `course_ids` (opcional) |
| `s21_get_my_profile` | Información del perfil del estudiante conectado en Canvas (nombre, ID institucional, correo). | - |

---

## Desarrollo Local

Requiere **Node.js `>= 22.0.0`**. Para compilar, probar y ejecutar el proyecto en un entorno de desarrollo local:

```bash
cd siglo21-canvas-mcp
npm install
npm run build
```

Ejecución de la suite de pruebas (compila TypeScript y ejecuta los tests de forma aislada con `S21_DB_PATH=":memory:"` y `NODE_ENV="test"`, sin credenciales reales ni escrituras en `data/`):
```bash
npm test
```

Ejecución directa del servidor compilado:
```bash
node dist/index.js
```

Para registrar el binario en el entorno local:
```bash
npm link
```

Configuración MCP para el binario enlazado:
```json
{
  "mcpServers": {
    "siglo21": {
      "command": "s21-canvas-mcp",
      "env": {
        "CANVAS_TOKEN": "...",
        "CANVAS_URL": "https://siglo21.instructure.com"
      }
    }
  }
}
```

---

## Compatibilidad de Clientes MCP

| Cliente | Transporte | Estado | Observaciones |
| :--- | :--- | :---: | :--- |
| Claude Desktop | stdio | Compatible | Soporte completo |
| Antigravity (Gemini) | stdio | Compatible | Soporte completo |
| Cursor | stdio | Compatible | Soporte completo |
| VS Code Copilot | stdio | Compatible | Requiere clave `mcp.servers` en configuración |
| Windsurf | stdio | Compatible | Soporte completo |
| Codex CLI (OpenAI) | stdio | Compatible | Soporte completo |
| Codex Cloud (ChatGPT) | — | No compatible | Entorno aislado sin soporte de transporte MCP |
| ChatGPT (Web / Desktop App) | HTTP remoto | Limitado | Requiere despliegue como servicio HTTP accesible públicamente |
