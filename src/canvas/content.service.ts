/**
 * Servicio de contenido académico de Canvas.
 *
 * Contiene la lógica de: assignments, modules, course files, readings,
 * discussion topics, rubric audit, syllabus y announcements.
 */

import type { CanvasClient } from "./client.js";
import { cleanHtmlToMarkdown } from "../content/html.js";
import {
  getCourseSamCatalog,
  fetchAndParseSamReading,
  type SamReadingItem,
} from "../content/sam.js";

export async function getAssignments(
  client: CanvasClient,
  courseId: number,
  cleanContent = true
) {
  const assignments = await client.getAllPages(
    `courses/${courseId}/assignments?per_page=100`
  );
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

export async function getModules(
  client: CanvasClient,
  courseId: number,
  cleanContent = true
) {
  const modules = await client.getAllPages(
    `courses/${courseId}/modules?include[]=items&per_page=100`
  );
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

export async function getCourseFiles(
  client: CanvasClient,
  courseId: number
) {
  try {
    const files = await client.getAllPages(
      `courses/${courseId}/files?per_page=100`
    );
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
    const modules = await client.getAllPages(
      `courses/${courseId}/modules?include[]=items&per_page=100`
    );
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
    const assignments = await client.getAllPages(
      `courses/${courseId}/assignments?per_page=100`
    );
    if (Array.isArray(assignments)) {
      for (const a of assignments) {
        const desc = a.description || "";
        const fileMatches = desc.matchAll(
          /(?:href|src)=["'][^"']*?\/files\/(\d+)(?:\/download|\/preview)?(?:\?[^"']*)?["']/gi
        );
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

export async function getFileInfo(client: CanvasClient, fileId: number) {
  const { data } = await client.request(`files/${fileId}`);
  return data;
}

/**
 * Obtiene el catálogo de las 16 lecturas oficiales SAM (meca.ues21.edu.ar)
 * parseando la página de módulos o portada del curso.
 */
export async function getCourseReadingsCatalog(
  client: CanvasClient,
  courseId: number
): Promise<SamReadingItem[]> {
  return getCourseSamCatalog(courseId, (endpoint) => client.request(endpoint));
}

export async function findReading(
  client: CanvasClient,
  courseId: number,
  moduleNumber: number,
  readingNumber: number
) {
  // 1. Prioridad 1: Buscar en el catálogo SAM interactivo oficial de Siglo 21
  try {
    const samCatalog = await getCourseReadingsCatalog(client, courseId);
    const samItem = samCatalog.find(
      (it) =>
        it.moduleNumber === moduleNumber &&
        it.readingNumber === readingNumber
    );
    if (samItem) {
      let extractedMarkdown = "";
      try {
        const parsed = await fetchAndParseSamReading(samItem.url);
        extractedMarkdown = parsed.markdown;
      } catch {
        // Si falla la extracción web, continuamos con metadatos del ítem
      }

      return {
        module_name: `Módulo ${moduleNumber}`,
        item_title: samItem.title || `Lectura ${readingNumber}`,
        type: "SAM",
        url: samItem.url,
        download_url: undefined,
        file_id: undefined,
        description_markdown: extractedMarkdown,
        source: "sam",
      };
    }
  } catch {
    // Fallback a módulos tradicionales de Canvas
  }

  // 2. Prioridad 2: Buscar en módulos nativos de Canvas (archivos / lecturas directas)
  let modules: any[] = [];
  try {
    modules = await client.getAllPages(
      `courses/${courseId}/modules?include[]=items&per_page=100`
    );
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
      // Corrección crítica: Solo hacer match si el ítem refiere explícitamente a esta lectura específica
      const targetItem = items.find((it: any) => {
        const title = (it.title || "").toLowerCase();
        return (
          title.includes(`lectura ${readingNumber}`) ||
          title.includes(`lectura_${readingNumber}`) ||
          title.includes(`l${readingNumber} `) ||
          title.endsWith(`l${readingNumber}`) ||
          title.includes(`actividad ${readingNumber}`)
        );
      });

      if (targetItem) {
        let downloadUrl: string | undefined;
        if (targetItem.type === "File" && targetItem.content_id) {
          try {
            const fileInfo = await getFileInfo(client, targetItem.content_id);
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

  // 3. Prioridad 3: Tarea / Trabajo Práctico del módulo
  // Solo como fallback si se solicitó la Lectura 1 para no duplicar el mismo TP en las lecturas 2, 3 y 4
  if (readingNumber === 1) {
    let assignments: any[] = [];
    try {
      assignments = await client.getAllPages(
        `courses/${courseId}/assignments?per_page=100`
      );
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
        const fileMatch = desc.match(
          /(?:href|src)=["']([^"']*?\/files\/(\d+)(?:\/download|\/preview)?[^"']*)["']/i
        );
        return {
          module_name: `Módulo ${moduleNumber}`,
          item_title: targetAssignment.name,
          type: "Assignment",
          file_id: fileMatch ? Number(fileMatch[2]) : undefined,
          download_url: fileMatch
            ? fileMatch[1].replace(/&amp;/g, "&")
            : undefined,
          description_markdown: cleanHtmlToMarkdown(desc),
        };
      }
    }
  }

  return null;
}

/**
 * Obtiene los Foros de debate del curso y analiza requisitos obligatorios (ej. Foro TP2).
 */
export async function getDiscussionTopics(
  client: CanvasClient,
  courseId: number
) {
  const topics = await client.getAllPages(
    `courses/${courseId}/discussion_topics?per_page=50`
  );
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
export async function auditAssignmentRubric(
  client: CanvasClient,
  courseId: number,
  assignmentId: number,
  studentDraft: string
) {
  const { data: assignment } = await client.request(
    `courses/${courseId}/assignments/${assignmentId}`
  );
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

export async function getSyllabus(client: CanvasClient, courseId: number) {
  const { data: course } = await client.request(
    `courses/${courseId}?include[]=syllabus_body&include[]=teachers&include[]=term`
  );
  return {
    id: course.id,
    name: course.name,
    course_code: course.course_code,
    term: course.term?.name,
    teachers: (course.teachers || []).map((t: any) => t.display_name),
    syllabus_markdown: cleanHtmlToMarkdown(course.syllabus_body),
  };
}

export async function getAnnouncements(
  client: CanvasClient,
  courseIds?: number[]
) {
  let endpoint = "announcements?per_page=50";
  if (courseIds && courseIds.length > 0) {
    const query = courseIds
      .map((id) => `context_codes[]=course_${id}`)
      .join("&");
    endpoint += `&${query}`;
  }
  const { data } = await client.request(endpoint);
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
