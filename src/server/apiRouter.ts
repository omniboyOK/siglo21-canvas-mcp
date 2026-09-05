import http from "node:http";
import { URL } from "node:url";
import { ExamRepository } from "../db/examRepository.js";
import { TOOLS_CATALOG } from "../toolsCatalog.js";
import { CanvasClient } from "../canvasClient.js";
import { downloadAndExtractPdf, isCanvasUrl } from "../pdfReader.js";

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

function resolveCanvasCredentials() {
  let url = (process.env.CANVAS_URL || "https://siglo21.instructure.com").replace(/\/+$/, "");
  let token = process.env.CANVAS_TOKEN || "";

  if (!token) {
    try {
      const configPath = path.join(os.homedir(), ".gemini", "antigravity", "mcp_config.json");
      if (fs.existsSync(configPath)) {
        const raw = fs.readFileSync(configPath, "utf-8");
        const parsed = JSON.parse(raw);
        if (parsed?.mcpServers?.siglo21?.env?.CANVAS_TOKEN) {
          token = parsed.mcpServers.siglo21.env.CANVAS_TOKEN;
          console.warn("[S21 Portal] Aviso: CANVAS_TOKEN cargado desde archivo de configuración local de desarrollo.");
        }
        if (parsed?.mcpServers?.siglo21?.env?.CANVAS_URL) {
          url = parsed.mcpServers.siglo21.env.CANVAS_URL.replace(/\/+$/, "");
        }
      }
    } catch {
      // Ignorar fallo de lectura de config
    }
  }
  return { url, token };
}

const creds = resolveCanvasCredentials();
const CANVAS_URL = creds.url;
const CANVAS_TOKEN = creds.token;

let activeCanvasClient: CanvasClient | null = CANVAS_TOKEN
  ? new CanvasClient({ baseUrl: CANVAS_URL, token: CANVAS_TOKEN })
  : null;

export function setCanvasClient(client: CanvasClient) {
  activeCanvasClient = client;
}

/**
 * Enrutador REST API para todas las peticiones bajo /api/*
 */
export async function handleApiRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  reqUrl: URL
): Promise<boolean> {
  const pathname = reqUrl.pathname;
  if (!pathname.startsWith("/api/")) return false;

  res.setHeader("Content-Type", "application/json; charset=utf-8");

  // GET /api/profile
  if (pathname === "/api/profile" && req.method === "GET") {
    if (!activeCanvasClient) {
      res.writeHead(503);
      res.end(JSON.stringify({ ok: false, error: "Canvas Client no configurado o token ausente" }));
      return true;
    }
    try {
      const profile = await activeCanvasClient.getSelf();
      res.writeHead(200);
      res.end(JSON.stringify({ ok: true, data: profile }));
    } catch (err: any) {
      res.writeHead(500);
      res.end(JSON.stringify({ ok: false, error: err.message }));
    }
    return true;
  }

  // GET /api/canvas/courses
  if (pathname === "/api/canvas/courses" && req.method === "GET") {
    if (!activeCanvasClient) {
      res.writeHead(503);
      res.end(JSON.stringify({ ok: false, error: "Canvas Client no configurado o token ausente" }));
      return true;
    }
    try {
      const includeConcluded = reqUrl.searchParams.get("include_concluded") === "true";
      const search = reqUrl.searchParams.get("search") || undefined;
      const courses = await activeCanvasClient.getCourses({ includeConcluded, search, compact: true });
      res.writeHead(200);
      res.end(JSON.stringify({ ok: true, data: courses }));
    } catch (err: any) {
      res.writeHead(500);
      res.end(JSON.stringify({ ok: false, error: err.message }));
    }
    return true;
  }

  // GET /api/canvas/dashboard (Perfil, materias activas, históricas y próximos eventos)
  if (pathname === "/api/canvas/dashboard" && req.method === "GET") {
    if (!activeCanvasClient) {
      res.writeHead(503);
      res.end(JSON.stringify({ ok: false, error: "Canvas Client no configurado o token ausente" }));
      return true;
    }
    try {
      const dashboard = await activeCanvasClient.getStudentDashboard();
      res.writeHead(200);
      res.end(JSON.stringify({ ok: true, data: dashboard }));
    } catch (err: any) {
      res.writeHead(500);
      res.end(JSON.stringify({ ok: false, error: err.message }));
    }
    return true;
  }

  // GET /api/canvas/events (Agenda de eventos y entregas unificadas)
  if (pathname === "/api/canvas/events" && req.method === "GET") {
    if (!activeCanvasClient) {
      res.writeHead(503);
      res.end(JSON.stringify({ ok: false, error: "Canvas Client no configurado o token ausente" }));
      return true;
    }
    try {
      const events = await activeCanvasClient.getUnifiedUpcomingEvents();
      res.writeHead(200);
      res.end(JSON.stringify({ ok: true, data: events }));
    } catch (err: any) {
      res.writeHead(500);
      res.end(JSON.stringify({ ok: false, error: err.message }));
    }
    return true;
  }

  // GET /api/canvas/pending-tasks
  if (pathname === "/api/canvas/pending-tasks" && req.method === "GET") {
    if (!activeCanvasClient) {
      res.writeHead(503);
      res.end(JSON.stringify({ ok: false, error: "Canvas Client no configurado o token ausente" }));
      return true;
    }
    try {
      const tasks = await activeCanvasClient.getPendingTasks();
      res.writeHead(200);
      res.end(JSON.stringify({ ok: true, data: tasks }));
    } catch (err: any) {
      res.writeHead(500);
      res.end(JSON.stringify({ ok: false, error: err.message }));
    }
    return true;
  }

  // GET /api/canvas/courses/:id/modules
  const modulesMatch = pathname.match(/^\/api\/canvas\/courses\/(\d+)\/modules$/);
  if (modulesMatch && req.method === "GET") {
    if (!activeCanvasClient) {
      res.writeHead(503);
      res.end(JSON.stringify({ ok: false, error: "Canvas Client no configurado o token ausente" }));
      return true;
    }
    try {
      const courseId = Number(modulesMatch[1]);
      const modules = await activeCanvasClient.getModules(courseId, true);
      res.writeHead(200);
      res.end(JSON.stringify({ ok: true, data: modules }));
    } catch (err: any) {
      res.writeHead(500);
      res.end(JSON.stringify({ ok: false, error: err.message }));
    }
    return true;
  }

  // GET /api/canvas/courses/:id/assignments
  const assignmentsMatch = pathname.match(/^\/api\/canvas\/courses\/(\d+)\/assignments$/);
  if (assignmentsMatch && req.method === "GET") {
    if (!activeCanvasClient) {
      res.writeHead(503);
      res.end(JSON.stringify({ ok: false, error: "Canvas Client no configurado o token ausente" }));
      return true;
    }
    try {
      const courseId = Number(assignmentsMatch[1]);
      const assignments = await activeCanvasClient.getAssignments(courseId, true);
      res.writeHead(200);
      res.end(JSON.stringify({ ok: true, data: assignments }));
    } catch (err: any) {
      res.writeHead(500);
      res.end(JSON.stringify({ ok: false, error: err.message }));
    }
    return true;
  }

  // GET /api/canvas/courses/:id/reading-text
  const readingTextMatch = pathname.match(/^\/api\/canvas\/courses\/(\d+)\/reading-text$/);
  if (readingTextMatch && req.method === "GET") {
    if (!activeCanvasClient) {
      res.writeHead(503);
      res.end(JSON.stringify({ ok: false, error: "Canvas Client no configurado o token ausente" }));
      return true;
    }
    try {
      const courseId = Number(readingTextMatch[1]);
      const moduleNum = Number(reqUrl.searchParams.get("module") || "1");
      const readingNum = Number(reqUrl.searchParams.get("reading") || "1");
      const fileIdParam = reqUrl.searchParams.get("file_id");

      let extractedText = "";
      let title = `Módulo ${moduleNum} - Lectura ${readingNum}`;
      let downloadUrl = "";
      let numPages = 0;

      if (fileIdParam) {
        const fileInfo = await activeCanvasClient.getFileInfo(Number(fileIdParam));
        title = fileInfo.display_name || fileInfo.filename || title;
        downloadUrl = fileInfo.url || fileInfo.download_url;
        if (downloadUrl) {
          const ext = await activeCanvasClient.downloadPdf(downloadUrl, 30);
          extractedText = ext.text;
          numPages = ext.numPages;
        }
      } else {
        const readingInfo = await activeCanvasClient.findReading(courseId, moduleNum, readingNum);
        if (readingInfo) {
          title = readingInfo.item_title || title;
          let dlUrl = readingInfo.download_url;
          if (!dlUrl && readingInfo.file_id) {
            const fInfo = await activeCanvasClient.getFileInfo(readingInfo.file_id);
            dlUrl = fInfo.url || fInfo.download_url;
          }
          downloadUrl = dlUrl || "";
          if (dlUrl) {
            try {
              const ext = await activeCanvasClient.downloadPdf(dlUrl, 30);
              extractedText = ext.text;
              numPages = ext.numPages;
            } catch (e: any) {
              extractedText = readingInfo.description_markdown || `No se pudo extraer texto del archivo: ${e.message}`;
            }
          } else if (readingInfo.description_markdown) {
            extractedText = readingInfo.description_markdown;
          }
        }
      }

      res.writeHead(200);
      res.end(JSON.stringify({
        ok: true,
        data: {
          title,
          text: extractedText || "No se encontró contenido textual disponible para esta lectura.",
          num_pages: numPages,
          download_url: downloadUrl,
        },
      }));
    } catch (err: any) {
      res.writeHead(200);
      res.end(JSON.stringify({
        ok: true,
        data: {
          title: `Lectura`,
          text: `No se pudo obtener el contenido en línea de esta lectura (${err.message}). La materia puede haber concluido o el contenido puede estar restringido en Canvas LMS.`,
          num_pages: 0,
        },
      }));
    }
    return true;
  }

  // GET /api/canvas/proxy-download?url=...&filename=...
  if (pathname === "/api/canvas/proxy-download" && req.method === "GET") {
    const targetUrl = reqUrl.searchParams.get("url");
    const filename = reqUrl.searchParams.get("filename") || "archivo_canvas.pdf";

    if (!targetUrl) {
      res.writeHead(400);
      res.end(JSON.stringify({ ok: false, error: "url es requerido" }));
      return true;
    }

    // Validar que la URL pertenece al dominio de Canvas para prevenir SSRF
    const canvasBase = activeCanvasClient?.getBaseUrl() || CANVAS_URL;
    if (!isCanvasUrl(targetUrl, canvasBase)) {
      res.writeHead(403);
      res.end(JSON.stringify({ ok: false, error: "Solo se permiten descargas desde el dominio oficial de Canvas" }));
      return true;
    }

    try {
      const headers: Record<string, string> = {
        "User-Agent": "S21-Canvas-MCP/1.0",
      };
      if (activeCanvasClient) {
        Object.assign(headers, activeCanvasClient.getAuthHeaders());
      }

      const response = await fetch(targetUrl, { headers });
      if (!response.ok) {
        res.writeHead(response.status);
        res.end(JSON.stringify({ ok: false, error: `Fallo al descargar archivo: ${response.statusText}` }));
        return true;
      }

      const contentType = response.headers.get("content-type") || "application/octet-stream";
      const contentLength = response.headers.get("content-length");

      const resHeaders: Record<string, string> = {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
      };
      if (contentLength) {
        resHeaders["Content-Length"] = contentLength;
      }

      res.writeHead(200, resHeaders);
      const arrayBuffer = await response.arrayBuffer();
      res.end(Buffer.from(arrayBuffer));
    } catch (err: any) {
      res.writeHead(500);
      res.end(JSON.stringify({ ok: false, error: err.message }));
    }
    return true;
  }

  // GET /api/courses
  if (pathname === "/api/courses" && req.method === "GET") {
    const courses = ExamRepository.getCoursesSummary();
    res.writeHead(200);
    res.end(JSON.stringify({ ok: true, data: courses }));
    return true;
  }

  // GET /api/tools
  if (pathname === "/api/tools" && req.method === "GET") {
    res.writeHead(200);
    res.end(JSON.stringify({ ok: true, data: TOOLS_CATALOG, tools: TOOLS_CATALOG }));
    return true;
  }

  // GET /api/questions?course_id=...&module=...&limit=...
  if (pathname === "/api/questions" && req.method === "GET") {
    const courseId = Number(reqUrl.searchParams.get("course_id"));
    if (!courseId) {
      res.writeHead(400);
      res.end(JSON.stringify({ ok: false, error: "course_id es requerido" }));
      return true;
    }
    const modParam = reqUrl.searchParams.get("module");
    const moduleNumber = modParam ? Number(modParam) : undefined;
    const limitParam = reqUrl.searchParams.get("limit");
    const limit = limitParam && !isNaN(Number(limitParam)) ? Number(limitParam) : undefined;
    const questions = ExamRepository.getQuestions(courseId, moduleNumber, limit);
    res.writeHead(200);
    res.end(JSON.stringify({ ok: true, data: questions }));
    return true;
  }

  // POST /api/questions
  if (pathname === "/api/questions" && req.method === "POST") {
    const body = await parseJsonBody(req);
    const courseId = Number(body.course_id);
    const courseName = String(body.course_name || `Materia ${courseId}`);
    const questions = Array.isArray(body.questions) ? body.questions : [body];

    if (!courseId || questions.length === 0) {
      res.writeHead(400);
      res.end(JSON.stringify({ ok: false, error: "course_id y questions son requeridos" }));
      return true;
    }

    const result = ExamRepository.saveQuestions(courseId, courseName, questions);
    res.writeHead(200);
    res.end(JSON.stringify({ ok: true, data: result }));
    return true;
  }

  // DELETE /api/questions/:id
  if (pathname.startsWith("/api/questions/") && req.method === "DELETE") {
    const questionId = Number(pathname.split("/").pop());
    if (!questionId) {
      res.writeHead(400);
      res.end(JSON.stringify({ ok: false, error: "ID de pregunta inválido" }));
      return true;
    }
    const deleted = ExamRepository.deleteQuestion(questionId);
    res.writeHead(200);
    res.end(JSON.stringify({ ok: true, deleted }));
    return true;
  }

  // POST /api/exams/generate
  if (pathname === "/api/exams/generate" && req.method === "POST") {
    const body = await parseJsonBody(req);
    const courseId = Number(body.course_id);
    if (!courseId) {
      res.writeHead(400);
      res.end(JSON.stringify({ ok: false, error: "course_id es requerido" }));
      return true;
    }

    const modules = Array.isArray(body.modules)
      ? body.modules.map((m: any) => Number(m)).filter((n: number) => !isNaN(n))
      : undefined;

    const count = body.count ? Number(body.count) : 10;
    const mode = body.mode === "practice" ? "practice" : "exam";
    const title = body.title ? String(body.title) : undefined;

    const examData = ExamRepository.generateRandomExam(courseId, {
      modules,
      count,
      mode,
      title,
    });

    res.writeHead(200);
    res.end(JSON.stringify({ ok: true, data: examData }));
    return true;
  }

  // POST /api/exams/submit
  if (pathname === "/api/exams/submit" && req.method === "POST") {
    const body = await parseJsonBody(req);
    const attemptId = Number(body.attempt_id);
    const timeSpent = Number(body.time_spent_seconds || 0);
    const answers = Array.isArray(body.answers) ? body.answers : [];

    if (!attemptId) {
      res.writeHead(400);
      res.end(JSON.stringify({ ok: false, error: "attempt_id es requerido" }));
      return true;
    }

    const result = ExamRepository.submitExamAttempt(attemptId, timeSpent, answers);
    res.writeHead(200);
    res.end(JSON.stringify({ ok: true, data: result }));
    return true;
  }

  // GET /api/attempts/:id
  if (pathname.startsWith("/api/attempts/") && req.method === "GET") {
    const attemptId = Number(pathname.split("/").pop());
    if (!attemptId) {
      res.writeHead(400);
      res.end(JSON.stringify({ ok: false, error: "ID de intento inválido" }));
      return true;
    }
    const details = ExamRepository.getAttemptDetails(attemptId);
    if (!details) {
      res.writeHead(404);
      res.end(JSON.stringify({ ok: false, error: "Intento no encontrado" }));
      return true;
    }
    res.writeHead(200);
    res.end(JSON.stringify({ ok: true, data: details }));
    return true;
  }

  // DELETE /api/attempts/:id
  if (pathname.startsWith("/api/attempts/") && req.method === "DELETE") {
    const attemptId = Number(pathname.split("/").pop());
    if (!attemptId) {
      res.writeHead(400);
      res.end(JSON.stringify({ ok: false, error: "ID de intento inválido" }));
      return true;
    }
    const deleted = ExamRepository.deleteAttempt(attemptId);
    res.writeHead(200);
    res.end(JSON.stringify({ ok: true, deleted }));
    return true;
  }

  // GET /api/history?course_id=...
  if (pathname === "/api/history" && req.method === "GET") {
    const courseIdParam = reqUrl.searchParams.get("course_id");
    if (!courseIdParam) {
      res.writeHead(400);
      res.end(JSON.stringify({ ok: false, error: "course_id es requerido" }));
      return true;
    }
    const history = ExamRepository.getCourseHistory(Number(courseIdParam));
    res.writeHead(200);
    res.end(JSON.stringify({ ok: true, data: history }));
    return true;
  }

  return false;
}

function parseJsonBody(req: http.IncomingMessage): Promise<any> {
  const MAX_BODY_SIZE = 1024 * 1024; // 1 MB límite para prevenir DoS por OOM
  return new Promise((resolve) => {
    let body = "";
    let destroyed = false;

    req.on("data", (chunk) => {
      if (destroyed) return;
      body += chunk;
      if (body.length > MAX_BODY_SIZE) {
        destroyed = true;
        req.destroy(new Error("Cuerpo de solicitud excede el límite de 1MB"));
        resolve({});
      }
    });
    req.on("end", () => {
      if (destroyed) return;
      const trimmed = body ? body.trim() : "";
      if (!trimmed) {
        return resolve({});
      }
      try {
        resolve(JSON.parse(trimmed));
      } catch {
        resolve({});
      }
    });
    req.on("error", () => resolve({}));
  });
}

