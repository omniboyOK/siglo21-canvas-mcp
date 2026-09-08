/**
 * Servicio de cursos y estado académico.
 *
 * Contiene la lógica de: listar cursos, obtener un curso, calcular estado académico
 * y obtener tareas pendientes.
 */

import type { CanvasClient } from "./client.js";

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
  grade_status:
    | "Promocionada"
    | "Regular / Aprobada"
    | "Desaprobada"
    | "En Cursada"
    | "Sin Calificación";
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

export async function getSelf(client: CanvasClient) {
  const { data } = await client.request("users/self");
  return data;
}

export async function getCourse(
  client: CanvasClient,
  courseId: number
): Promise<any> {
  const { data } = await client.request(`courses/${courseId}`);
  return data;
}

export async function getCourses(
  client: CanvasClient,
  options?: CourseListOptions
) {
  const includeConcluded = Boolean(options?.includeConcluded);
  const compact = options?.compact !== false;
  const search = options?.search
    ? options.search
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim()
    : "";

  const endpoint = includeConcluded
    ? "courses?include[]=term&include[]=total_scores&include[]=concluded&include[]=teachers&per_page=100"
    : "courses?enrollment_state=active&include[]=term&include[]=total_scores&include[]=teachers&per_page=100";

  const rawCourses = await client.getAllPages(endpoint);
  if (!Array.isArray(rawCourses)) return [];

  let courses = rawCourses.filter(
    (c: any) => c.name && !c.access_restricted_by_date
  );

  if (search) {
    const searchTokens = search.split(/\s+/).map((t) => {
      return t.length >= 5 ? t.replace(/[aeiou]$/, "") : t;
    });

    courses = courses.filter((c: any) => {
      const nameNormalized = (c.name || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
      const codeNormalized = (c.course_code || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
      return searchTokens.every(
        (tok) =>
          nameNormalized.includes(tok) || codeNormalized.includes(tok)
      );
    });
  }

  if (!compact) {
    return courses;
  }

  return courses.map((c: any): CompactCourse => {
    const enrollment =
      Array.isArray(c.enrollments) && c.enrollments.length > 0
        ? c.enrollments[0]
        : null;
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

/**
 * Obtiene la agenda de tareas y entregas pendientes de materias activas,
 * ordenadas cronológicamente con días restantes.
 */
export async function getPendingTasks(
  client: CanvasClient
): Promise<PendingTaskItem[]> {
  const activeCourses = await getCourses(client, {
    includeConcluded: false,
    compact: true,
  });
  const now = new Date();
  const pendingList: PendingTaskItem[] = [];

  for (const course of activeCourses) {
    try {
      const assignments = await client.getAllPages(
        `courses/${course.id}/assignments?per_page=100`
      );
      const submissions = await client.getAllPages(
        `courses/${course.id}/students/submissions?student_ids[]=self&per_page=100`
      );
      const submittedMap = new Map<number, boolean>();

      for (const sub of submissions || []) {
        if (
          sub.submitted_at ||
          sub.workflow_state === "submitted" ||
          sub.workflow_state === "graded"
        ) {
          submittedMap.set(sub.assignment_id, true);
        }
      }

      for (const a of assignments || []) {
        if (!a.due_at) continue;
        const isSubmitted =
          submittedMap.get(a.id) || a.has_submitted_submissions;
        const dueDate = new Date(a.due_at);

        // Si no está entregada
        if (!isSubmitted) {
          const diffMs = dueDate.getTime() - now.getTime();
          const daysRemaining = Number(
            (diffMs / (1000 * 60 * 60 * 24)).toFixed(1)
          );

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
  return pendingList.sort(
    (a, b) => new Date(a.due_at).getTime() - new Date(b.due_at).getTime()
  );
}

/**
 * Evalúa las notas de TPs de una materia, calcula promedio en escala 1-10
 * y proyecta la nota mínima necesaria en los TPs restantes para Promoción Directa o Regularidad.
 */
export async function getAcademicStatus(
  client: CanvasClient,
  courseId: number,
  targetPromoGrade = 7,
  targetRegularGrade = 5
): Promise<AcademicStatusResult> {
  const { data: course } = await client.request(
    `courses/${courseId}?include[]=total_scores`
  );
  const assignments = await client.getAllPages(
    `courses/${courseId}/assignments?per_page=100`
  );
  const submissions = await client.getAllPages(
    `courses/${courseId}/students/submissions?student_ids[]=self&per_page=100`
  );

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
    const rawScore =
      sub?.score !== undefined && sub?.score !== null
        ? Number(sub.score)
        : null;
    const grade10 =
      rawScore !== null
        ? Number(((rawScore / pointsPossible) * 10).toFixed(2))
        : null;
    const isSubmitted = Boolean(
      sub?.submitted_at ||
        sub?.workflow_state === "submitted" ||
        sub?.workflow_state === "graded"
    );

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
    sumGraded = gradedTps.reduce(
      (acc: number, curr: any) => acc + curr.grade_10,
      0
    );
    currentAvg10 = Number((sumGraded / gradedCount).toFixed(2));
  }

  let requiredForPromo: number | null = null;
  let requiredForRegular: number | null = null;

  if (remainingCount > 0) {
    const neededSumPromo = targetPromoGrade * totalTpsCount - sumGraded;
    const neededSumRegular = targetRegularGrade * totalTpsCount - sumGraded;

    requiredForPromo = Number(
      Math.max(0, neededSumPromo / remainingCount).toFixed(2)
    );
    requiredForRegular = Number(
      Math.max(0, neededSumRegular / remainingCount).toFixed(2)
    );
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
    current_score_canvas:
      course.enrollments?.[0]?.computed_current_score ?? null,
    graded_tps: gradedTps,
    pending_tps: pendingTps,
    current_tp_average_10: currentAvg10,
    required_average_for_promotion: requiredForPromo,
    required_average_for_regularity: requiredForRegular,
    status_summary: summary,
  };
}
