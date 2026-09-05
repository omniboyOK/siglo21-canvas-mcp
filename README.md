# 🎓 s21-canvas-mcp

Servidor **Model Context Protocol (MCP)** para conectar asistentes de IA (Claude Desktop, Cursor, Antigravity, Windsurf) con el entorno **Canvas LMS de la Universidad Siglo 21**.

Incluye soporte para consultar materias, notas, trabajos prácticos, cronogramas y **extraer en memoria el texto de lecturas y PDFs** para que el LLM pueda resumirte la materia y responder dudas académicas.

---

## ⚡ Instalación y Uso Rápido con `npx`

No necesitas clonar ni instalar nada permanente si lo agregas directamente a tu cliente MCP preferido:

### 1. Claude Desktop (`claude_desktop_config.json`)

Ubica tu archivo de configuración:
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

### 2. Antigravity / Cursor / Windsurf

En la configuración de MCP de tu editor (o en `.gemini/antigravity/mcp.json`):

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

## 🔑 ¿Cómo obtener tu Token de Canvas Siglo 21?

1. Ingresá a tu cuenta en [Canvas Siglo 21](https://siglo21.instructure.com).
2. Andá a **Cuenta** (tu foto de perfil en la barra lateral izquierda) > **Configuraciones**.
3. Scrolleá hasta **Tokens de acceso aprobados** y hacé clic en **+ Nuevo token de acceso**.
4. Poné un nombre (ej. `MCP-Agente`) y hacé clic en **Generar token**.
5. Copiá el token generado y pegalo en la variable `CANVAS_TOKEN`.

---

## 🛠️ Herramientas Disponibles (Tools)

| Herramienta | Descripción para Alumnos | Parámetros |
| :--- | :--- | :--- |
| `s21_open_exam_simulator` | **Simulador Interactivo de Exámenes** con persistencia en SQLite local, temporizador de APIs, modos examen/práctica y panel institucional Siglo 21. | `port` (opcional), `auto_open` (boolean) |
| `s21_save_questions_to_bank` | Guarda un lote de preguntas en la base de datos SQLite local para generar simulacros aleatorios por materia y módulo. | `course_id`, `course_name`, `questions` (array) |
| `s21_get_exam_bank_summary` | Consulta las estadísticas del banco de preguntas y el promedio histórico de exámenes en SQLite. | - |
| `s21_open_interactive_guide` | **Portal web interactivo** con guía visual de herramientas, ejemplos y generador de prompts. | `port` (opcional), `auto_open` (boolean) |
| `s21_check_academic_status` | Calculadora de notas mínimas para Promoción Directa (7+) o Regularidad (5+). | `course_id` (number), `target_promo_grade`, `target_regular_grade` |
| `s21_generate_practice_quiz` | Generador de prompts y preguntas tipo examen con justificación teórica. | `course_id`, `module_number`, `reading_number`, `question_count` |
| `s21_audit_rubric` | Auditor de borradores de TP contra la rúbrica oficial de corrección. | `course_id`, `assignment_id`, `draft_text` |
| `s21_get_pending_tasks` | Agenda consolidada de TPs y entregas con cuenta regresiva. | - |
| `s21_get_reading` | Buscador directo y extracción de texto de lecturas SAM (1.1 a 4.4). | `course_id`, `module_number`, `reading_number` |
| `s21_read_pdf_content` | Lector y extractor de texto de PDFs y documentos en memoria. | `file_id` o `download_url`, `max_pages` |
| `s21_search_readings` | Búsqueda transversal de conceptos en todos tus apuntes y lecturas. | `query` (string) |
| `s21_list_courses` | Materias activas o históricas, notas y períodos. | `include_concluded` (boolean), `search` (string) |
| `s21_get_assignments` | TPs, consignas limpias en Markdown y rúbricas. | `course_id` (number) |
| `s21_get_modules` | Módulos SAM, lecturas y actividades por unidad. | `course_id` (number) |
| `s21_get_course_files` | Biblioteca de archivos y documentos de la materia. | `course_id` (number) |
| `s21_get_discussion_topics` | Foros de debate del curso y consignas grupales. | `course_id` (number) |
| `s21_get_syllabus` | Programa oficial de materia y datos docentes. | `course_id` (number) |
| `s21_get_upcoming_events` | Próximas entregas y eventos en el calendario. | - |
| `s21_get_announcements` | Avisos publicados por los profesores. | `course_ids` (number[]) |
| `s21_get_my_profile` | Perfil del estudiante (nombre, ID, correo). | - |

---

## 💻 Desarrollo Local y Compilación

Si deseas probar o modificar el código localmente:

```bash
cd s21-canvas-mcp
npm install
npm run build
```

Para probarlo localmente sin publicar:
```bash
node dist/index.js
```
O enlazarlo localmente:
```bash
npm link
```
Y luego en tu configuración MCP:
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

## 🚀 Publicación en NPM

Para publicarlo y que esté disponible con `npx s21-canvas-mcp` para todo el mundo:

```bash
npm login
npm publish --access public
```
