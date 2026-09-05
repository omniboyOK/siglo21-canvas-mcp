import fs from "fs";
import path from "path";
import { cleanHtmlToMarkdown } from "./htmlUtils.js";
import { downloadAndExtractPdf } from "./pdfReader.js";

export interface CanvasClientConfig {
  baseUrl: string;
  token: string;
}

export interface CourseListOptions {
  includeConcluded?: boolean;
  search?: string;
  compact?: boolean;
}

export interface CompactCourse {
  id: number;
  name: string;
  course_code: string;
  term_name?: string;
  start_at?: string | null;
  end_at?: string | null;
  concluded?: boolean;
  current_score?: number | null;
  final_score?: number | null;
}

export interface EnhancedCourseItem extends CompactCourse {
  clean_name: string;
  dates_label: string | null;
  year: string;
  effective_score_100: number | null;
  effective_score_10: number | null;
  grade_status: "Promocionada" | "Regular / Aprobada" | "Desaprobada" | "En Cursada" | "Sin Calificación";
}

export interface UpcomingEventItem {
  id: string | number;
  title: string;
  date: string;
  type: "assignment" | "event" | "exam";
  courseName?: string;
  htmlUrl?: string;
  daysRemaining?: number;
  description?: string;
}

export interface StudentDashboardData {
  profile: any;
  stats: {
    activeCount: number;
    completedCount: number;
    gpa10: number | null;
    gpa100: number | null;
    promotedCount: number;
    regularCount: number;
  };
  activeCourses: EnhancedCourseItem[];
  historicalCourses: EnhancedCourseItem[];
  upcomingEvents: UpcomingEventItem[];
}

export interface PendingTaskItem {
  course_id: number;
  course_name: string;
  assignment_id: number;
  title: string;
  due_at: string;
  days_remaining: number;
  points_possible?: number;
  html_url?: string;
}

export interface AcademicStatusResult {
  course_id: number;
  course_name: string;
  current_score_canvas: number | null;
  graded_tps: Array<{
    id: number;
    name: string;
    score: number | null;
    points_possible: number;
    grade_10: number | null;
    submitted: boolean;
  }>;
  pending_tps: Array<{
    id: number;
    name: string;
    due_at?: string;
    points_possible: number;
  }>;
  current_tp_average_10: number | null;
  required_average_for_promotion: number | null;
  required_average_for_regularity: number | null;
  status_summary: string;
}

export class CanvasClient {
  private baseUrl: string;
  private token: string;

  constructor(config: CanvasClientConfig) {
    this.baseUrl = config.baseUrl.trim().replace(/\/+$/, "");
    this.token = config.token.trim();
  }

  public getRawToken(): string {
    return this.token;
  }

  public async request(endpointOrUrl: string): Promise<{ data: any; nextUrl: string | null }> {
    const url = endpointOrUrl.startsWith("http")
      ? endpointOrUrl
      : `${this.baseUrl}/api/v1/${endpointOrUrl.replace(/^\/+/, "")}`;

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: "application/json",
        "User-Agent": "S21-Canvas-MCP/1.2",
      },
    });

    if (!res.ok) {
      let errText = "";
      try {
        const errorJson = await res.json();
        errText = JSON.stringify(errorJson);
      } catch {
        errText = await res.text();
      }
      throw new Error(`HTTP ${res.status}: ${errText || res.statusText}`);
    }

    const data = await res.json();

    const linkHeader = res.headers.get("link") || res.headers.get("Link");
    let nextUrl: string | null = null;
    if (linkHeader) {
      const links = linkHeader.split(",");
      for (const l of links) {
        if (l.includes('rel="next"')) {
          const match = l.match(/<([^>]+)>/);
          if (match) {
            nextUrl = match[1];
          }
        }
      }
    }

    return { data, nextUrl };
  }

  public async getAllPages(endpoint: string): Promise<any[]> {
    const items: any[] = [];
    let currentUrl: string | null = endpoint;

    while (currentUrl) {
      const { data, nextUrl } = await this.request(currentUrl);
      if (Array.isArray(data)) {
        items.push(...data);
      } else {
        return data;
      }
      currentUrl = nextUrl;
    }

    return items;
  }

  public async getSelf() {
    const { data } = await this.request("users/self");
    return data;
  }

  public async getCourses(options?: CourseListOptions) {
    const includeConcluded = Boolean(options?.includeConcluded);
    const compact = options?.compact !== false;
    const search = options?.search ? options.search.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim() : "";

    const endpoint = includeConcluded
      ? "courses?include[]=term&include[]=total_scores&include[]=concluded&include[]=teachers&per_page=100"
      : "courses?enrollment_state=active&include[]=term&include[]=total_scores&include[]=teachers&per_page=100";

    const rawCourses = await this.getAllPages(endpoint);
    if (!Array.isArray(rawCourses)) return [];

    let courses = rawCourses.filter((c: any) => c.name && !c.access_restricted_by_date);

    if (search) {
      const searchTokens = search.split(/\s+/).map((t) => {
        return t.length >= 5 ? t.replace(/[aeiou]$/, "") : t;
      });

      courses = courses.filter((c: any) => {
        const nameNormalized = (c.name || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const codeNormalized = (c.course_code || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        return searchTokens.every((tok) => nameNormalized.includes(tok) || codeNormalized.includes(tok));
      });
    }

    if (!compact) {
      return courses;
    }

    return courses.map((c: any): CompactCourse => {
      const enrollment = Array.isArray(c.enrollments) && c.enrollments.length > 0 ? c.enrollments[0] : null;
      return {
        id: c.id,
        name: c.name,
        course_code: c.course_code,
        term_name: c.term?.name,
        start_at: c.start_at || c.term?.start_at,
        end_at: c.end_at || c.term?.end_at,
        concluded: Boolean(c.concluded),
        current_score: enrollment?.computed_current_score ?? null,
        final_score: enrollment?.computed_final_score ?? null,
      };
    });
  }

  public async getAssignments(courseId: number, cleanContent = true) {
    const assignments = await this.getAllPages(`courses/${courseId}/assignments?per_page=100`);
    if (!Array.isArray(assignments)) return [];

    if (!cleanContent) return assignments;

    return assignments.map((a: any) => ({
      id: a.id,
      name: a.name,
      due_at: a.due_at,
      points_possible: a.points_possible,
      description_markdown: cleanHtmlToMarkdown(a.description),
      submission_types: a.submission_types,
      has_submitted: a.has_submitted_submissions,
      rubric: a.rubric?.map((r: any) => ({
        description: r.description,
        points: r.points,
      })),
    }));
  }

  public async getModules(courseId: number, cleanContent = true) {
    const modules = await this.getAllPages(`courses/${courseId}/modules?include[]=items&per_page=100`);
    if (!Array.isArray(modules)) return [];

    if (!cleanContent) return modules;

    return modules.map((m: any) => ({
      id: m.id,
      name: m.name,
      position: m.position,
      items_count: m.items_count,
      items: (m.items || []).map((it: any) => ({
        id: it.id,
        title: it.title,
        type: it.type,
        content_id: it.content_id,
        page_url: it.page_url,
        url: it.url,
        html_url: it.html_url,
      })),
    }));
  }

  public async getCourseFiles(courseId: number) {
    try {
      const files = await this.getAllPages(`courses/${courseId}/files?per_page=100`);
      if (Array.isArray(files) && files.length > 0) {
        return files.map((f: any) => ({
          id: f.id,
          display_name: f.display_name || f.filename,
          filename: f.filename,
          size_mb: Number(((f.size || 0) / (1024 * 1024)).toFixed(2)),
          download_url: f.url,
          created_at: f.created_at,
          source: "course_files",
        }));
      }
    } catch {
      // Ignorar fallo de endpoint directo de archivos y pasar a fallback
    }

    const collectedFiles = new Map<number | string, any>();

    try {
      const modules = await this.getAllPages(`courses/${courseId}/modules?include[]=items&per_page=100`);
      if (Array.isArray(modules)) {
        for (const mod of modules) {
          for (const item of mod.items || []) {
            if (item.type === "File" && item.content_id) {
              collectedFiles.set(item.content_id, {
                id: item.content_id,
                display_name: item.title,
                filename: item.title,
                module: mod.name,
                api_url: item.url,
                source: "module_item",
              });
            }
          }
        }
      }
    } catch {
      // noop
    }

    try {
      const assignments = await this.getAllPages(`courses/${courseId}/assignments?per_page=100`);
      if (Array.isArray(assignments)) {
        for (const a of assignments) {
          const desc = a.description || "";
          const fileMatches = desc.matchAll(/(?:href|src)=["'][^"']*?\/files\/(\d+)(?:\/download|\/preview)?(?:\?[^"']*)?["']/gi);
          for (const match of fileMatches) {
            const fId = Number(match[1]);
            if (!collectedFiles.has(fId)) {
              collectedFiles.set(fId, {
                id: fId,
                display_name: `Archivo adjunto en ${a.name}`,
                filename: `file_${fId}.pdf`,
                assignment: a.name,
                source: "assignment_attachment",
              });
            }
          }
        }
      }
    } catch {
      // noop
    }

    return Array.from(collectedFiles.values());
  }

  public async getFileInfo(fileId: number) {
    const { data } = await this.request(`files/${fileId}`);
    return data;
  }

  public async getUpcomingEvents() {
    const { data } = await this.request("users/self/upcoming_events");
    return data;
  }

  public async getCalendarEvents(options?: {
    type?: "event" | "assignment";
    startDate?: string;
    endDate?: string;
    allEvents?: boolean;
    contextCodes?: string[];
  }) {
    let endpoint = "calendar_events?per_page=50";
    if (options?.allEvents) {
      endpoint += "&all_events=true";
    }
    if (options?.type) {
      endpoint += `&type=${options.type}`;
    }
    if (options?.startDate) {
      endpoint += `&start_date=${options.startDate}`;
    }
    if (options?.endDate) {
      endpoint += `&end_date=${options.endDate}`;
    }
    if (options?.contextCodes && options.contextCodes.length > 0) {
      const query = options.contextCodes.map((c) => `context_codes[]=${encodeURIComponent(c)}`).join("&");
      endpoint += `&${query}`;
    }
    try {
      const { data } = await this.request(endpoint);
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }

  public async getAnnouncements(courseIds?: number[]) {
    let endpoint = "announcements?per_page=50";
    if (courseIds && courseIds.length > 0) {
      const query = courseIds.map((id) => `context_codes[]=course_${id}`).join("&");
      endpoint += `&${query}`;
    }
    const { data } = await this.request(endpoint);
    if (!Array.isArray(data)) return [];

    return data.map((a: any) => ({
      id: a.id,
      title: a.title,
      posted_at: a.posted_at,
      author_name: a.user_name,
      context_code: a.context_code,
      message_markdown: cleanHtmlToMarkdown(a.message),
      url: a.url,
    }));
  }

  public async getSyllabus(courseId: number) {
    const { data: course } = await this.request(`courses/${courseId}?include[]=syllabus_body&include[]=teachers&include[]=term`);
    return {
      id: course.id,
      name: course.name,
      course_code: course.course_code,
      term: course.term?.name,
      teachers: (course.teachers || []).map((t: any) => t.display_name),
      syllabus_markdown: cleanHtmlToMarkdown(course.syllabus_body),
    };
  }

  public async findReading(courseId: number, moduleNumber: number, readingNumber: number) {
    let modules: any[] = [];
    try {
      modules = await this.getAllPages(`courses/${courseId}/modules?include[]=items&per_page=100`);
    } catch {
      modules = [];
    }
    if (Array.isArray(modules)) {
      const targetMod = modules.find((m: any) => {
        const modTitle = (m.name || "").toLowerCase();
        return (
          m.position === moduleNumber ||
          modTitle.includes(`modulo ${moduleNumber}`) ||
          modTitle.includes(`módulo ${moduleNumber}`) ||
          modTitle.includes(`m${moduleNumber}`) ||
          modTitle.includes(`unidad ${moduleNumber}`)
        );
      });

      if (targetMod) {
        const items = targetMod.items || [];
        const targetItem = items.find((it: any) => {
          const title = (it.title || "").toLowerCase();
          return (
            title.includes(`lectura ${readingNumber}`) ||
            title.includes(`l${readingNumber}`) ||
            title.includes(`lectura_${readingNumber}`) ||
            title.includes(`actividad ${readingNumber}`) ||
            title.includes(`actividad práctica - m${moduleNumber}`)
          );
        });

        if (targetItem) {
          let downloadUrl: string | undefined;
          if (targetItem.type === "File" && targetItem.content_id) {
            try {
              const fileInfo = await this.getFileInfo(targetItem.content_id);
              downloadUrl = fileInfo.url || fileInfo.download_url;
            } catch {
              // noop
            }
          }
          return {
            module_name: targetMod.name,
            item_title: targetItem.title,
            type: targetItem.type,
            file_id: targetItem.content_id,
            download_url: downloadUrl,
            url: targetItem.url || targetItem.html_url,
          };
        }
      }
    }

    let assignments: any[] = [];
    try {
      assignments = await this.getAllPages(`courses/${courseId}/assignments?per_page=100`);
    } catch {
      assignments = [];
    }
    if (Array.isArray(assignments)) {
      const targetAssignment = assignments.find((a: any) => {
        const name = (a.name || "").toLowerCase();
        return (
          name.includes(`tp${moduleNumber}`) ||
          name.includes(`tp ${moduleNumber}`) ||
          name.includes(`trabajo práctico ${moduleNumber}`) ||
          name.includes(`m${moduleNumber}`)
        );
      });

      if (targetAssignment) {
        const desc = targetAssignment.description || "";
        const fileMatch = desc.match(/(?:href|src)=["']([^"']*?\/files\/(\d+)(?:\/download|\/preview)?[^"']*)["']/i);
        return {
          module_name: `Módulo ${moduleNumber}`,
          item_title: targetAssignment.name,
          type: "Assignment",
          file_id: fileMatch ? Number(fileMatch[2]) : undefined,
          download_url: fileMatch ? fileMatch[1].replace(/&amp;/g, "&") : undefined,
          description_markdown: cleanHtmlToMarkdown(desc),
        };
      }
    }

    return null;
  }

  // ==========================================
  // NUEVAS CAPACIDADES FASE 2
  // ==========================================

  /**
   * Obtiene la agenda de tareas y entregas pendientes de materias activas,
   * ordenadas cronológicamente con días restantes.
   */
  public async getPendingTasks(): Promise<PendingTaskItem[]> {
    const activeCourses = await this.getCourses({ includeConcluded: false, compact: true });
    const now = new Date();
    const pendingList: PendingTaskItem[] = [];

    for (const course of activeCourses) {
      try {
        const assignments = await this.getAllPages(`courses/${course.id}/assignments?per_page=100`);
        const submissions = await this.getAllPages(`courses/${course.id}/students/submissions?student_ids[]=self&per_page=100`);
        const submittedMap = new Map<number, boolean>();

        for (const sub of submissions || []) {
          if (sub.submitted_at || sub.workflow_state === "submitted" || sub.workflow_state === "graded") {
            submittedMap.set(sub.assignment_id, true);
          }
        }

        for (const a of assignments || []) {
          if (!a.due_at) continue;
          const isSubmitted = submittedMap.get(a.id) || a.has_submitted_submissions;
          const dueDate = new Date(a.due_at);

          // Si no está entregada
          if (!isSubmitted) {
            const diffMs = dueDate.getTime() - now.getTime();
            const daysRemaining = Number((diffMs / (1000 * 60 * 60 * 24)).toFixed(1));

            pendingList.push({
              course_id: course.id,
              course_name: course.name,
              assignment_id: a.id,
              title: a.name,
              due_at: a.due_at,
              days_remaining: daysRemaining,
              points_possible: a.points_possible,
              html_url: a.html_url,
            });
          }
        }
      } catch {
        // Continuar con los demás cursos
      }
    }

    // Ordenar por fecha de entrega más próxima
    return pendingList.sort((a, b) => new Date(a.due_at).getTime() - new Date(b.due_at).getTime());
  }

  /**
   * Evalúa las notas de TPs de una materia, calcula promedio en escala 1-10
   * y proyecta la nota mínima necesaria en los TPs restantes para Promoción Directa o Regularidad.
   */
  public async getAcademicStatus(courseId: number, targetPromoGrade = 7, targetRegularGrade = 5): Promise<AcademicStatusResult> {
    const { data: course } = await this.request(`courses/${courseId}?include[]=total_scores`);
    const assignments = await this.getAllPages(`courses/${courseId}/assignments?per_page=100`);
    const submissions = await this.getAllPages(`courses/${courseId}/students/submissions?student_ids[]=self&per_page=100`);

    const submissionMap = new Map<number, any>();
    for (const sub of submissions || []) {
      submissionMap.set(sub.assignment_id, sub);
    }

    // Identificar los 4 Trabajos Prácticos principales (TP1 a TP4)
    const tpAssignments = (assignments || []).filter((a: any) => {
      const name = (a.name || "").toLowerCase();
      return (
        name.includes("trabajo práctico") ||
        name.includes("trabajo practico") ||
        /tp\s*[1-4]/i.test(name)
      );
    });

    const gradedTps: any[] = [];
    const pendingTps: any[] = [];

    for (const a of tpAssignments) {
      const sub = submissionMap.get(a.id);
      const pointsPossible = a.points_possible || 100;
      const rawScore = sub?.score !== undefined && sub?.score !== null ? Number(sub.score) : null;
      const grade10 = rawScore !== null ? Number(((rawScore / pointsPossible) * 10).toFixed(2)) : null;
      const isSubmitted = Boolean(sub?.submitted_at || sub?.workflow_state === "submitted" || sub?.workflow_state === "graded");

      if (grade10 !== null) {
        gradedTps.push({
          id: a.id,
          name: a.name,
          score: rawScore,
          points_possible: pointsPossible,
          grade_10: grade10,
          submitted: isSubmitted,
        });
      } else {
        pendingTps.push({
          id: a.id,
          name: a.name,
          due_at: a.due_at,
          points_possible: pointsPossible,
        });
      }
    }

    const totalTpsCount = tpAssignments.length || 4;
    const gradedCount = gradedTps.length;
    const remainingCount = totalTpsCount - gradedCount;

    let currentAvg10: number | null = null;
    let sumGraded = 0;

    if (gradedCount > 0) {
      sumGraded = gradedTps.reduce((acc, curr) => acc + curr.grade_10, 0);
      currentAvg10 = Number((sumGraded / gradedCount).toFixed(2));
    }

    let requiredForPromo: number | null = null;
    let requiredForRegular: number | null = null;

    if (remainingCount > 0) {
      const neededSumPromo = targetPromoGrade * totalTpsCount - sumGraded;
      const neededSumRegular = targetRegularGrade * totalTpsCount - sumGraded;

      requiredForPromo = Number(Math.max(0, neededSumPromo / remainingCount).toFixed(2));
      requiredForRegular = Number(Math.max(0, neededSumRegular / remainingCount).toFixed(2));
    }

    let summary = "";
    if (gradedCount === 0) {
      summary = `Aún no hay calificaciones cargadas en los ${totalTpsCount} Trabajos Prácticos. Se requiere promedio ${targetPromoGrade} para Promoción y ${targetRegularGrade} para Regularidad.`;
    } else if (remainingCount === 0) {
      if (currentAvg10 !== null && currentAvg10 >= targetPromoGrade) {
        summary = `🎉 ¡Felicitaciones! Cumples con la condición de Promoción Directa (Promedio TPs: ${currentAvg10} / 10).`;
      } else if (currentAvg10 !== null && currentAvg10 >= targetRegularGrade) {
        summary = `✅ Cumples con la condición de Regularidad (Promedio TPs: ${currentAvg10} / 10). Deberás rendir Examen Final Regular.`;
      } else {
        summary = `⚠️ Tu promedio final de TPs es ${currentAvg10} / 10 (por debajo de ${targetRegularGrade}). Consultá las instancias de recuperatorio.`;
      }
    } else {
      summary = `Promedio actual en ${gradedCount}/${totalTpsCount} TPs: ${currentAvg10}/10. Para lograr Promoción Directa (${targetPromoGrade}), necesitas promediar al menos ${requiredForPromo}/10 en los ${remainingCount} TPs restantes. Para Regularidad (${targetRegularGrade}), necesitas al menos ${requiredForRegular}/10.`;
    }

    return {
      course_id: courseId,
      course_name: course.name,
      current_score_canvas: course.enrollments?.[0]?.computed_current_score ?? null,
      graded_tps: gradedTps,
      pending_tps: pendingTps,
      current_tp_average_10: currentAvg10,
      required_average_for_promotion: requiredForPromo,
      required_average_for_regularity: requiredForRegular,
      status_summary: summary,
    };
  }

  /**
   * Obtiene los Foros de debate del curso y analiza requisitos obligatorios (ej. Foro TP2).
   */
  public async getDiscussionTopics(courseId: number) {
    const topics = await this.getAllPages(`courses/${courseId}/discussion_topics?per_page=50`);
    if (!Array.isArray(topics)) return [];

    return topics.map((t: any) => {
      const isObligatoryTpForum = /foro\s*2|tp\s*2|grupal/i.test(t.title || "");
      return {
        id: t.id,
        title: t.title,
        posted_at: t.posted_at,
        lock_at: t.lock_at,
        locked: Boolean(t.locked),
        unread_count: t.unread_count,
        is_obligatory_tp_forum: isObligatoryTpForum,
        require_initial_post: Boolean(t.require_initial_post),
        message_markdown: cleanHtmlToMarkdown(t.message),
        html_url: t.html_url,
      };
    });
  }

  /**
   * Audita un borrador de texto entregado por el estudiante contra la rúbrica oficial de la tarea en Canvas.
   */
  public async auditAssignmentRubric(courseId: number, assignmentId: number, studentDraft: string) {
    const { data: assignment } = await this.request(`courses/${courseId}/assignments/${assignmentId}`);
    const rubric = assignment.rubric || [];
    const rubricSettings = assignment.rubric_settings || {};

    const criteriaFormatted = rubric.map((c: any) => ({
      id: c.id,
      description: c.description,
      long_description: c.long_description || "",
      max_points: c.points,
      ratings: (c.ratings || []).map((r: any) => ({
        description: r.description,
        points: r.points,
      })),
    }));

    return {
      assignment_id: assignment.id,
      assignment_name: assignment.name,
      points_possible: assignment.points_possible,
      rubric_title: rubricSettings.title || assignment.name,
      rubric_criteria: criteriaFormatted,
      audit_prompt_for_ai: `Actúa como docente evaluador de la Universidad Siglo 21.
Evalúa rigurosamente el siguiente borrador de entrega del alumno para "${assignment.name}" cotejándolo con cada uno de los criterios oficiales de la rúbrica de Canvas.

--- RÚBRICA OFICIAL (${assignment.points_possible} pts) ---
${JSON.stringify(criteriaFormatted, null, 2)}

--- BORRADOR DEL ALUMNO ---
${studentDraft}
---------------------------

Entrega un informe estructurado con:
1. Puntuación estimada por cada criterio con justificación explícita.
2. Fortalezas observadas.
3. Aspectos a corregir o completar antes del envío definitivo para maximizar el puntaje.`,
    };
  }

  /**
   * Búsqueda transversal de conceptos o palabras clave en PDFs locales del directorio de descargas.
   */
  public async searchLocalReadings(query: string, baseDir = "descargas") {
    const results: Array<{ file_path: string; filename: string; snippet: string }> = [];
    const normalizedQuery = query.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

    let searchDir = path.resolve(baseDir);
    if (!fs.existsSync(searchDir)) {
      const parentDir = path.resolve("..", baseDir);
      if (fs.existsSync(parentDir)) {
        searchDir = parentDir;
      } else {
        return {
          query,
          message: `El directorio local '${baseDir}' no existe o no contiene archivos descargados todavía.`,
          results: [],
        };
      }
    }

    function walkSync(dir: string, fileList: string[] = []) {
      const files = fs.readdirSync(dir);
      for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
          walkSync(fullPath, fileList);
        } else if (file.toLowerCase().endsWith(".pdf") || file.toLowerCase().endsWith(".txt") || file.toLowerCase().endsWith(".md")) {
          fileList.push(fullPath);
        }
      }
      return fileList;
    }

    const allFiles = walkSync(searchDir);

    for (const filePath of allFiles) {
      try {
        if (filePath.toLowerCase().endsWith(".txt") || filePath.toLowerCase().endsWith(".md")) {
          const content = fs.readFileSync(filePath, "utf8");
          const normContent = content.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
          const matchIdx = normContent.indexOf(normalizedQuery);
          if (matchIdx !== -1) {
            const start = Math.max(0, matchIdx - 150);
            const end = Math.min(content.length, matchIdx + query.length + 150);
            results.push({
              file_path: filePath,
              filename: path.basename(filePath),
              snippet: `...${content.slice(start, end).replace(/\s+/g, " ")}...`,
            });
          }
        } else if (filePath.toLowerCase().endsWith(".pdf")) {
          // Búsqueda en PDF local
          const dataBuffer = fs.readFileSync(filePath);
          const pdfParse = (await import("pdf-parse")).default;
          const pdfData = await pdfParse(dataBuffer, { max: 10 });
          const normContent = pdfData.text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
          const matchIdx = normContent.indexOf(normalizedQuery);
          if (matchIdx !== -1) {
            const start = Math.max(0, matchIdx - 150);
            const end = Math.min(pdfData.text.length, matchIdx + query.length + 150);
            results.push({
              file_path: filePath,
              filename: path.basename(filePath),
              snippet: `...${pdfData.text.slice(start, end).replace(/\s+/g, " ")}...`,
            });
          }
        }
      } catch {
        // Continuar con los demás archivos
      }
    }

    return {
      query,
      found_count: results.length,
      results,
    };
  }

  /**
   * Obtiene una lista consolidada y deduplicada de próximos eventos,
   * entregas de trabajos prácticos (TPs) y fechas de calendario en orden cronológico.
   */
  public async getUnifiedUpcomingEvents(): Promise<UpcomingEventItem[]> {
    const events: UpcomingEventItem[] = [];

    // 1. Tareas y entregas pendientes
    try {
      const pendingTasks = await this.getPendingTasks();
      for (const t of pendingTasks) {
        events.push({
          id: `task_${t.assignment_id}`,
          title: t.title,
          date: t.due_at,
          type: "assignment",
          courseName: cleanCourseTitle(t.course_name),
          htmlUrl: t.html_url,
          daysRemaining: t.days_remaining,
        });
      }
    } catch (e) {
      console.error("[CanvasClient] Error obteniendo pending tasks:", e);
    }

    // 2. Eventos próximos de la API de Canvas
    try {
      const upcoming = await this.getUpcomingEvents();
      if (Array.isArray(upcoming)) {
        for (const ev of upcoming) {
          const dateStr = ev.start_at || ev.end_at || ev.due_at;
          if (!dateStr) continue;
          const evDate = new Date(dateStr);
          const diffDays = Number(((evDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)).toFixed(1));
          events.push({
            id: `upcoming_${ev.id}`,
            title: ev.title || "Evento",
            date: dateStr,
            type: ev.assignment ? "assignment" : "event",
            courseName: cleanCourseTitle(ev.context_name || ev.context_code || ""),
            htmlUrl: ev.html_url || ev.url,
            daysRemaining: diffDays,
            description: ev.description ? cleanHtmlToMarkdown(ev.description) : undefined,
          });
        }
      }
    } catch (e) {
      console.error("[CanvasClient] Error obteniendo upcoming events:", e);
    }

    // 3. Eventos de Calendario
    try {
      const nowIso = new Date().toISOString().split("T")[0];
      const calEvents = await this.getCalendarEvents({ startDate: nowIso });
      if (Array.isArray(calEvents)) {
        for (const ev of calEvents) {
          const dateStr = ev.start_at || ev.end_at;
          if (!dateStr) continue;
          const evDate = new Date(dateStr);
          const diffDays = Number(((evDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)).toFixed(1));
          events.push({
            id: `cal_${ev.id}`,
            title: ev.title || "Evento de Calendario",
            date: dateStr,
            type: "event",
            courseName: cleanCourseTitle(ev.context_name || ev.context_code || ""),
            htmlUrl: ev.html_url || ev.url,
            daysRemaining: diffDays,
          });
        }
      }
    } catch (e) {
      console.error("[CanvasClient] Error obteniendo calendar events:", e);
    }

    // Deduplicar por título y fecha
    const seen = new Set<string>();
    const deduplicated = events.filter((ev) => {
      const key = `${(ev.title || "").toLowerCase().trim()}_${(ev.date || "").substring(0, 10)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Ordenar cronológicamente
    return deduplicated.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }

  /**
   * Genera el payload integral del Dashboard estudiantil:
   * - Perfil oficial y avatar del alumno
   * - Estadísticas académicas (materias activas, aprobadas, promedio histórico)
   * - Materias cursando actualmente
   * - Historial completo de materias concluidas con notas y estados
   * - Agenda de próximos eventos y entregas
   */
  public async getStudentDashboard(): Promise<StudentDashboardData> {
    // 1. Perfil del estudiante
    let profile: any = {};
    try {
      profile = await this.getSelf();
    } catch (e) {
      console.error("[CanvasClient] Error obteniendo self profile:", e);
    }

    // 2. Todos los cursos para clasificar en activos e históricos
    let allCourses: any[] = [];
    try {
      allCourses = await this.getCourses({ includeConcluded: true, compact: true });
    } catch (e) {
      console.error("[CanvasClient] Error obteniendo cursos:", e);
    }

    const activeCourses: EnhancedCourseItem[] = [];
    const historicalCourses: EnhancedCourseItem[] = [];

    let totalScoreSum = 0;
    let gradedCount = 0;
    let promotedCount = 0;
    let regularCount = 0;

    for (const c of allCourses) {
      const cleanName = cleanCourseTitle(c.name);
      const datesLabel = extractCourseDates(c.name);
      const year = extractCourseYear(c);

      const score100 = c.current_score ?? c.final_score ?? null;
      const score10 = score100 !== null ? Number((score100 / 10).toFixed(1)) : null;

      const isConcluded = Boolean(c.concluded);

      let gradeStatus: EnhancedCourseItem["grade_status"] = "Sin Calificación";
      if (!isConcluded) {
        gradeStatus = "En Cursada";
      } else if (score10 !== null) {
        if (score10 >= 7) {
          gradeStatus = "Promocionada";
          promotedCount++;
        } else if (score10 >= 5) {
          gradeStatus = "Regular / Aprobada";
          regularCount++;
        } else {
          gradeStatus = "Desaprobada";
        }
      }

      const enhanced: EnhancedCourseItem = {
        ...c,
        clean_name: cleanName,
        dates_label: datesLabel,
        year,
        effective_score_100: score100,
        effective_score_10: score10,
        grade_status: gradeStatus,
      };

      if (!isConcluded) {
        activeCourses.push(enhanced);
      } else {
        historicalCourses.push(enhanced);
        if (score100 !== null) {
          totalScoreSum += score100;
          gradedCount++;
        }
      }
    }

    // Ordenar históricas por año descendente y nombre
    historicalCourses.sort((a, b) => {
      if (b.year !== a.year) return b.year.localeCompare(a.year);
      return a.clean_name.localeCompare(b.clean_name);
    });

    // Promedios históricos
    const gpa100 = gradedCount > 0 ? Number((totalScoreSum / gradedCount).toFixed(1)) : null;
    const gpa10 = gpa100 !== null ? Number((gpa100 / 10).toFixed(2)) : null;

    // 3. Próximos eventos
    let upcomingEvents: UpcomingEventItem[] = [];
    try {
      upcomingEvents = await this.getUnifiedUpcomingEvents();
    } catch (e) {
      console.error("[CanvasClient] Error obteniendo unified events:", e);
    }

    return {
      profile,
      stats: {
        activeCount: activeCourses.length,
        completedCount: historicalCourses.length,
        gpa10,
        gpa100,
        promotedCount,
        regularCount,
      },
      activeCourses,
      historicalCourses,
      upcomingEvents,
    };
  }
}

/**
 * Limpia el nombre de la materia removiendo cadenas de fechas redundantes.
 * Ej: "ALGORITMOS Y ESTRUCTURA DE DATOS I 04-AUG-2025 04-OCT-2025" -> "ALGORITMOS Y ESTRUCTURA DE DATOS I"
 */
export function cleanCourseTitle(rawName: string): string {
  if (!rawName) return "";
  return rawName.replace(/\s+\d{1,2}-[A-Z]{3}-\d{4}\s+\d{1,2}-[A-Z]{3}-\d{4}/gi, "").trim();
}

/**
 * Extrae el rango legible de fechas de cursada del nombre o inicio/fin.
 */
export function extractCourseDates(rawName: string): string | null {
  if (!rawName) return null;
  const m = rawName.match(/(\d{1,2}-[A-Z]{3}-\d{4})\s+(\d{1,2}-[A-Z]{3}-\d{4})/i);
  if (m) {
    return `${m[1]} al ${m[2]}`;
  }
  return null;
}

/**
 * Determina el año del curso a partir del nombre, término o fecha de inicio.
 */
export function extractCourseYear(course: { name: string; term_name?: string; start_at?: string | null }): string {
  const m = course.name.match(/202\d/);
  if (m) return m[0];
  if (course.term_name) {
    const tm = course.term_name.match(/202\d/);
    if (tm) return tm[0];
    const slashM = course.term_name.match(/\/(\d{2})/);
    if (slashM) return `20${slashM[1]}`;
  }
  if (course.start_at) {
    return course.start_at.substring(0, 4);
  }
  return "2025";
}

