import http from "node:http";
import { URL } from "node:url";
import { ExamRepository } from "../db/examRepository.js";
import { TOOLS_CATALOG } from "../toolsCatalog.js";
import { CanvasClient } from "../canvasClient.js";
import { downloadAndExtractPdf, isCanvasUrl } from "../pdfReader.js";
import * as storageManager from "../storageManager.js";

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

function resolveCanvasCredentials() {
  let url = (process.env.CANVAS_URL || "https://siglo21.instructure.com").replace(/\/+$/, "");
  let token = process.env.CANVAS_TOKEN || "";

  if (!token) {
    const candidatePaths = [
      path.join(os.homedir(), ".gemini", "config", "mcp_config.json"),
      path.join(os.homedir(), ".gemini", "antigravity", "mcp_config.json"),
      path.join(os.homedir(), ".gemini", "antigravity-ide", "mcp_config.json"),
    ];

    for (const configPath of candidatePaths) {
      if (token) break;
      try {
        if (fs.existsSync(configPath)) {
          const raw = fs.readFileSync(configPath, "utf-8");
          const parsed = JSON.parse(raw);
          const serverConfig = parsed?.mcpServers?.["s21-canvas-mcp"] || parsed?.mcpServers?.["siglo21"];
          if (serverConfig?.env?.CANVAS_TOKEN) {
            token = serverConfig.env.CANVAS_TOKEN;
            console.warn(`[S21 Portal] Aviso: CANVAS_TOKEN cargado desde ${configPath}`);
          }
          if (serverConfig?.env?.CANVAS_URL) {
            url = serverConfig.env.CANVAS_URL.replace(/\/+$/, "");
          }
        }
      } catch {
        // Ignorar fallo de lectura de config
      }
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
      let pendingTasks: any[] = [];
      try {
        pendingTasks = await activeCanvasClient.getPendingTasks();
      } catch {
        // Silencioso si falla pending tasks
      }

      const normalizedDashboard = {
        ...dashboard,
        student: dashboard.profile,
        active_courses: dashboard.activeCourses,
        historical_courses: dashboard.historicalCourses,
        concluded_courses: dashboard.historicalCourses,
        upcoming_events: dashboard.upcomingEvents,
        pendingTasks,
        pending_tasks: pendingTasks,
      };

      res.writeHead(200);
      res.end(JSON.stringify({ ok: true, data: normalizedDashboard }));
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
    try {
      const courseId = Number(readingTextMatch[1]);
      const moduleNum = Number(reqUrl.searchParams.get("module") || "1");
      const readingNum = Number(reqUrl.searchParams.get("reading") || "1");
      const fileIdParam = reqUrl.searchParams.get("file_id");
      const courseNameParam = reqUrl.searchParams.get("course_name") || "";

      // 1. Verificar si ya existe guardada en disco localmente (Offline-First)
      const localReading = storageManager.getReading(courseId, moduleNum, readingNum);
      if (localReading) {
        const pdfFilename = localReading.pdfPath ? path.basename(localReading.pdfPath) : "";
        const downloadUrl = pdfFilename
          ? `/api/canvas/proxy-download?course_id=${courseId}&filename=${encodeURIComponent(pdfFilename)}`
          : "";
        const inlineUrl = pdfFilename
          ? `/api/canvas/proxy-download?course_id=${courseId}&filename=${encodeURIComponent(pdfFilename)}&inline=true`
          : "";

        res.writeHead(200);
        res.end(JSON.stringify({
          ok: true,
          data: {
            title: localReading.title,
            text: localReading.markdown,
            num_pages: 0,
            download_url: downloadUrl,
            inline_url: inlineUrl,
            online_url: "",
            source: "local",
            local: true,
            has_pdf: localReading.hasPdf,
            pdf_path: localReading.pdfPath,
            md_path: localReading.mdPath,
          },
        }));
        return true;
      }

      // Si no está en disco local, requerimos Canvas Client para consultar online
      if (!activeCanvasClient) {
        res.writeHead(503);
        res.end(JSON.stringify({ ok: false, error: "Canvas Client no configurado o token ausente" }));
        return true;
      }

      let extractedText = "";
      let title = `Módulo ${moduleNum} - Lectura ${readingNum}`;
      let downloadUrl = "";
      let inlineUrl = "";
      let onlineUrl = "";
      let sourceType = "canvas";
      let numPages = 0;
      let pdfBuffer: Buffer | undefined;

      if (fileIdParam) {
        const fileInfo = await activeCanvasClient.getFileInfo(Number(fileIdParam));
        title = fileInfo.display_name || fileInfo.filename || title;
        downloadUrl = fileInfo.url || fileInfo.download_url;
        if (downloadUrl) {
          const ext = await activeCanvasClient.downloadPdf(downloadUrl, 30);
          extractedText = ext.text;
          numPages = ext.numPages;
          pdfBuffer = ext.buffer;
        }
      } else {
        const readingInfo = await activeCanvasClient.findReading(courseId, moduleNum, readingNum);
        if (readingInfo) {
          title = readingInfo.item_title || title;
          onlineUrl = readingInfo.url || "";
          sourceType = readingInfo.source || readingInfo.type || "canvas";

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
              pdfBuffer = ext.buffer;
            } catch (e: any) {
              extractedText = readingInfo.description_markdown || `No se pudo extraer texto del archivo: ${e.message}`;
            }
          } else if (readingInfo.description_markdown) {
            extractedText = readingInfo.description_markdown;
          }
        }
      }

      // Resolver nombre de curso si es necesario para nombrar la carpeta
      let resolvedCourseName = courseNameParam;
      if (!resolvedCourseName && activeCanvasClient) {
        try {
          const cInfo = await activeCanvasClient.getCourse(courseId);
          if (cInfo?.name) resolvedCourseName = cInfo.name;
        } catch {}
      }

      // Guardar en disco tanto el Markdown procesado como el PDF original si se extrajo texto
      let savedResult: { mdPath: string; pdfPath?: string } | undefined;
      if (extractedText && extractedText.trim()) {
        try {
          savedResult = storageManager.saveReading(
            courseId,
            moduleNum,
            readingNum,
            title,
            extractedText,
            pdfBuffer,
            resolvedCourseName
          );
          if (savedResult.pdfPath) {
            const pdfFilename = path.basename(savedResult.pdfPath);
            downloadUrl = `/api/canvas/proxy-download?course_id=${courseId}&filename=${encodeURIComponent(pdfFilename)}`;
            inlineUrl = `/api/canvas/proxy-download?course_id=${courseId}&filename=${encodeURIComponent(pdfFilename)}&inline=true`;
          }
        } catch (saveErr) {
          console.warn("[Storage] Error al persistir lectura local en disco:", saveErr);
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
          inline_url: inlineUrl,
          online_url: onlineUrl,
          source: sourceType,
          local: Boolean(savedResult?.mdPath || savedResult?.pdfPath),
          has_pdf: Boolean(savedResult?.pdfPath),
          pdf_path: savedResult?.pdfPath,
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

  // GET /api/canvas/courses/:id/readings-catalog
  const readingsCatalogMatch = pathname.match(/^\/api\/canvas\/courses\/(\d+)\/readings-catalog$/);
  if (readingsCatalogMatch && req.method === "GET") {
    const courseId = Number(readingsCatalogMatch[1]);
    let catalog: any[] = [];

    if (activeCanvasClient) {
      try {
        catalog = await activeCanvasClient.getCourseReadingsCatalog(courseId);
      } catch (err: any) {
        console.warn(`[ReadingsCatalog] Fallo al consultar catálogo en línea para curso ${courseId}:`, err.message);
      }
    }

    // Fallback: Si no hay catálogo en línea, generar la estructura base de 16 lecturas (4 módulos x 4 lecturas)
    if (!catalog || catalog.length === 0) {
      catalog = [];
      let globalIdx = 1;
      for (let m = 1; m <= 4; m++) {
        for (let l = 1; l <= 4; l++) {
          catalog.push({
            moduleNumber: m,
            readingNumber: l,
            globalIndex: globalIdx++,
            title: `Módulo ${m} - Lectura ${l}`,
            url: "",
          });
        }
      }
    }

    // Enriquecer cada ítem con información de archivos locales persistidos en disco
    const enrichedCatalog = catalog.map((item) => {
      const localFiles = storageManager.findLocalReadingFiles(courseId, item.moduleNumber, item.readingNumber);
      const hasLocalPdf = Boolean(localFiles?.hasPdf && localFiles?.pdfPath);
      const hasLocalMd = Boolean(localFiles?.hasMd && localFiles?.mdPath);
      const pdfFilename = localFiles?.pdfPath ? path.basename(localFiles.pdfPath) : undefined;
      const localPdfUrl = pdfFilename
        ? `/api/canvas/proxy-download?course_id=${courseId}&filename=${encodeURIComponent(pdfFilename)}&inline=true`
        : undefined;

      const title = (localFiles?.title && !localFiles.title.startsWith("Módulo") && !localFiles.title.startsWith("Modulo"))
        ? localFiles.title
        : item.title;

      return {
        ...item,
        title,
        has_local_pdf: hasLocalPdf,
        has_local_md: hasLocalMd,
        local_pdf_path: localFiles?.pdfPath,
        local_pdf_url: localPdfUrl,
        local_md_path: localFiles?.mdPath,
      };
    });

    res.writeHead(200);
    res.end(JSON.stringify({ ok: true, data: enrichedCatalog }));
    return true;
  }

  // GET /api/canvas/proxy-download?url=...&filename=...&course_id=...&course_name=...
  if (pathname === "/api/canvas/proxy-download" && req.method === "GET") {
    const targetUrl = reqUrl.searchParams.get("url");
    const filename = reqUrl.searchParams.get("filename") || "archivo_canvas.pdf";
    const courseIdParam = reqUrl.searchParams.get("course_id");
    const courseNameParam = reqUrl.searchParams.get("course_name") || "";
    const courseId = courseIdParam ? Number(courseIdParam) : undefined;

    // 1. Comprobar si el archivo ya existe localmente en la carpeta de la materia o en data/courses
    let localFilePath: string | null = null;
    if (courseId) {
      localFilePath = storageManager.findLocalCourseFile(courseId, filename);
    }
    if (!localFilePath) {
      localFilePath = storageManager.findAnyLocalFile(filename);
    }

    if (localFilePath && fs.existsSync(localFilePath)) {
      try {
        const stat = fs.statSync(localFilePath);
        const ext = path.extname(localFilePath).toLowerCase();
        const contentType = ext === ".pdf" 
          ? "application/pdf" 
          : ext === ".md" 
            ? "text/markdown; charset=utf-8" 
            : "application/octet-stream";

        const isInline = reqUrl.searchParams.get("inline") === "true";
        const dispositionType = isInline ? "inline" : "attachment";

        res.writeHead(200, {
          "Content-Type": contentType,
          "Content-Disposition": `${dispositionType}; filename="${encodeURIComponent(path.basename(localFilePath))}"`,
          "Content-Length": String(stat.size),
        });

        const readStream = fs.createReadStream(localFilePath);
        readStream.pipe(res);
        return true;
      } catch (streamErr: any) {
        console.warn("[Storage] Error al servir archivo local:", streamErr);
      }
    }

    // 2. Si no existe en disco, se requiere url para descargarlo de Canvas
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
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Guardar en la carpeta de la materia si se dispone de courseId
      if (courseId) {
        try {
          storageManager.saveCourseFile(courseId, filename, buffer, courseNameParam);
        } catch (saveErr) {
          console.warn("[Storage] Error al guardar archivo descargado en materia:", saveErr);
        }
      }

      const isInline = reqUrl.searchParams.get("inline") === "true";
      const dispositionType = isInline ? "inline" : "attachment";

      const resHeaders: Record<string, string> = {
        "Content-Type": contentType,
        "Content-Disposition": `${dispositionType}; filename="${encodeURIComponent(filename)}"`,
        "Content-Length": String(buffer.length),
      };

      res.writeHead(200, resHeaders);
      res.end(buffer);
    } catch (err: any) {
      res.writeHead(500);
      res.end(JSON.stringify({ ok: false, error: err.message }));
    }
    return true;
  }

  // POST /api/storage/open-file (Abre el PDF o archivo local en el visor por defecto del sistema)
  if (pathname === "/api/storage/open-file" && req.method === "POST") {
    const body = await parseJsonBody(req);
    const courseId = body.course_id ? Number(body.course_id) : undefined;
    const moduleNum = body.module ? Number(body.module) : undefined;
    const readingNum = body.reading ? Number(body.reading) : undefined;
    const targetPath = body.path ? String(body.path) : undefined;
    const filename = body.filename ? String(body.filename) : undefined;

    let opened = false;
    if (courseId && moduleNum && readingNum) {
      opened = storageManager.openReadingPdf(courseId, moduleNum, readingNum);
    } else if (targetPath) {
      opened = storageManager.openPathInSystem(targetPath);
    } else if (courseId && filename) {
      const localFile = storageManager.findLocalCourseFile(courseId, filename);
      if (localFile) {
        opened = storageManager.openPathInSystem(localFile);
      }
    }

    res.writeHead(200);
    res.end(JSON.stringify({ ok: opened, opened }));
    return true;
  }

  // POST /api/storage/open-folder (Abre la carpeta de la materia en el explorador de archivos local)
  if (pathname === "/api/storage/open-folder" && req.method === "POST") {
    const body = await parseJsonBody(req);
    const courseId = Number(body.course_id);
    const courseName = body.course_name ? String(body.course_name) : undefined;
    if (!courseId) {
      res.writeHead(400);
      res.end(JSON.stringify({ ok: false, error: "course_id es requerido" }));
      return true;
    }
    const opened = storageManager.openCourseFolder(courseId, courseName);
    res.writeHead(200);
    res.end(JSON.stringify({ ok: opened, opened }));
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

