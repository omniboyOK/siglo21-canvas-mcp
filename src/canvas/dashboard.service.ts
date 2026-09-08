/**
 * Servicio del Dashboard estudiantil.
 *
 * Orquesta los servicios de cursos y eventos para generar
 * el payload integral del dashboard.
 */

import type { CanvasClient } from "./client.js";
import {
  getSelf,
  getCourses,
  type EnhancedCourseItem,
} from "./courses.service.js";
import {
  getUnifiedUpcomingEvents,
  type UpcomingEventItem,
} from "./events.service.js";
import { cleanCourseTitle, extractCourseDates, extractCourseYear } from "./utils.js";

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

/**
 * Genera el payload integral del Dashboard estudiantil:
 * - Perfil oficial y avatar del alumno
 * - Estadísticas académicas (materias activas, aprobadas, promedio histórico)
 * - Materias cursando actualmente
 * - Historial completo de materias concluidas con notas y estados
 * - Agenda de próximos eventos y entregas
 */
export async function getStudentDashboard(
  client: CanvasClient
): Promise<StudentDashboardData> {
  // 1. Perfil del estudiante
  let profile: any = {};
  try {
    profile = await getSelf(client);
  } catch (e) {
    console.error("[DashboardService] Error obteniendo self profile:", e);
  }

  // 2. Todos los cursos para clasificar en activos e históricos
  let allCourses: any[] = [];
  try {
    allCourses = await getCourses(client, {
      includeConcluded: true,
      compact: true,
    });
  } catch (e) {
    console.error("[DashboardService] Error obteniendo cursos:", e);
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
    const score10 =
      score100 !== null ? Number((score100 / 10).toFixed(1)) : null;

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
  const gpa100 =
    gradedCount > 0 ? Number((totalScoreSum / gradedCount).toFixed(1)) : null;
  const gpa10 = gpa100 !== null ? Number((gpa100 / 10).toFixed(2)) : null;

  // 3. Próximos eventos
  let upcomingEvents: UpcomingEventItem[] = [];
  try {
    upcomingEvents = await getUnifiedUpcomingEvents(client);
  } catch (e) {
    console.error("[DashboardService] Error obteniendo unified events:", e);
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
