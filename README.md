# s21-canvas-mcp

Servidor **Model Context Protocol (MCP)** para integrar asistentes de inteligencia artificial (Claude Desktop, Cursor, Antigravity, Windsurf, VS Code Copilot, Codex CLI) con la plataforma **Canvas LMS de la Universidad Siglo 21**.

Proporciona capacidades para consultar asignaturas, calificaciones, trabajos prácticos, cronogramas y realizar la extracción en memoria del contenido de lecturas y documentos PDF para análisis, síntesis y asistencia académica mediante modelos de lenguaje.

---

## Instalación

Seleccione la configuración correspondiente a su entorno o cliente de IA. Es necesario contar con un token de acceso personal de Canvas LMS (consulte las instrucciones en [Obtención del Token de Canvas](#obtencion-del-token-de-canvas)).

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

## Obtencion del Token de Canvas

1. Inicie sesión en [Canvas Siglo 21](https://siglo21.instructure.com).
2. Diríjase a [Cuenta](https://siglo21.instructure.com/profile/settings).
3. Desplácese hasta la sección **Tokens de acceso aprobados** y seleccione **+ Nuevo token de acceso**.
4. Asigne un nombre identificador (por ejemplo, `MCP-Agent`) y seleccione **Generar token**.
5. Copie el token generado y asígnelo al parámetro `CANVAS_TOKEN` en la configuración correspondiente.

IMPORTANTE: No darle los permisos del token a nadie, ya que permite el acceso a toda tu información académica. En caso de hacerlo revocarlo desde la misma sección.

---

## Herramientas Disponibles

| Herramienta | Descripción | Parámetros |
| :--- | :--- | :--- |
| `s21_open_exam_simulator` | Simulador interactivo de exámenes con persistencia en SQLite local, temporizador de API, modos examen/práctica y panel institucional Siglo 21. | `port` (número, opcional), `auto_open` (booleano) |
| `s21_save_questions_to_bank` | Registra preguntas en la base de datos local SQLite para la generación de simulacros por materia y módulo. | `course_id`, `course_name`, `questions` (array) |
| `s21_get_exam_bank_summary` | Estadísticas del banco de preguntas y registro histórico de exámenes en SQLite. | - |
| `s21_open_interactive_guide` | Portal web interactivo con documentación de herramientas, casos de uso y generador de prompts. | `port` (número, opcional), `auto_open` (booleano) |
| `s21_check_academic_status` | Análisis de calificaciones mínimas requeridas para Promoción Directa (7+) o Regularidad (5+). | `course_id` (número), `target_promo_grade`, `target_regular_grade` |
| `s21_generate_practice_quiz` | Generación estructurada de preguntas tipo examen con fundamentación conceptual. | `course_id`, `module_number`, `reading_number`, `question_count` |
| `s21_audit_rubric` | Auditoría de borradores de entregas académicas frente a la rúbrica oficial de evaluación. | `course_id`, `assignment_id`, `draft_text` |
| `s21_get_pending_tasks` | Consolidación de tareas pendientes y entregas con fechas límite. | - |
| `s21_get_reading` | Consulta y extracción de texto de lecturas SAM (1.1 a 4.4). | `course_id`, `module_number`, `reading_number` |
| `s21_read_pdf_content` | Extracción de contenido de documentos PDF en memoria sin almacenamiento en disco. | `file_id` o `download_url`, `max_pages` |
| `s21_search_readings` | Búsqueda transversal por términos en material y lecturas descargadas. | `query` (string) |
| `s21_list_courses` | Consulta de asignaturas activas o concluidas, calificaciones y períodos académicos. | `include_concluded` (booleano), `search` (string) |
| `s21_get_assignments` | Trabajos prácticos, consignas en formato Markdown y criterios de rúbrica. | `course_id` (número) |
| `s21_get_modules` | Estructura de módulos SAM, lecturas y actividades organizadas por unidad. | `course_id` (número) |
| `s21_get_course_files` | Explorador de archivos y documentos asociados a la asignatura. | `course_id` (número) |
| `s21_get_discussion_topics` | Foros de discusión académica y consignas de trabajo grupal. | `course_id` (número) |
| `s21_get_syllabus` | Programa oficial de la asignatura y datos del cuerpo docente. | `course_id` (número) |
| `s21_get_upcoming_events` | Próximos eventos y fechas límite del calendario institucional. | - |
| `s21_get_announcements` | Anuncios institucionales y publicaciones de cátedra. | `course_ids` (array de números) |
| `s21_get_my_profile` | Datos del perfil de estudiante (nombre, identificador institucional, correo electrónico). | - |

---

## Desarrollo Local

Para compilar y ejecutar el proyecto en un entorno de desarrollo local:

```bash
cd s21-canvas-mcp
npm install
npm run build
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
