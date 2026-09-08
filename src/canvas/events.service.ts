/**
 * Servicio de eventos y calendario de Canvas.
 */

import type { CanvasClient } from "./client.js";
import { cleanHtmlToMarkdown } from "../content/html.js";
import { cleanCourseTitle } from "./utils.js";
import { getPendingTasks } from "./courses.service.js";

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

export async function getUpcomingEvents(client: CanvasClient) {
  const { data } = await client.request("users/self/upcoming_events");
  return data;
}

export async function getCalendarEvents(
  client: CanvasClient,
  options?: {
    type?: "event" | "assignment";
    startDate?: string;
    endDate?: string;
    allEvents?: boolean;
    contextCodes?: string[];
  }
) {
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
    const query = options.contextCodes
      .map((c) => `context_codes[]=${encodeURIComponent(c)}`)
      .join("&");
    endpoint += `&${query}`;
  }
  try {
    const { data } = await client.request(endpoint);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

/**
 * Obtiene una lista consolidada y deduplicada de próximos eventos,
 * entregas de trabajos prácticos (TPs) y fechas de calendario en orden cronológico.
 */
export async function getUnifiedUpcomingEvents(
  client: CanvasClient
): Promise<UpcomingEventItem[]> {
  const events: UpcomingEventItem[] = [];

  // 1. Tareas y entregas pendientes
  try {
    const pendingTasks = await getPendingTasks(client);
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
    console.error("[EventsService] Error obteniendo pending tasks:", e);
  }

  // 2. Eventos próximos de la API de Canvas
  try {
    const upcoming = await getUpcomingEvents(client);
    if (Array.isArray(upcoming)) {
      for (const ev of upcoming) {
        const dateStr = ev.start_at || ev.end_at || ev.due_at;
        if (!dateStr) continue;
        const evDate = new Date(dateStr);
        const diffDays = Number(
          (
            (evDate.getTime() - Date.now()) /
            (1000 * 60 * 60 * 24)
          ).toFixed(1)
        );
        events.push({
          id: `upcoming_${ev.id}`,
          title: ev.title || "Evento",
          date: dateStr,
          type: ev.assignment ? "assignment" : "event",
          courseName: cleanCourseTitle(
            ev.context_name || ev.context_code || ""
          ),
          htmlUrl: ev.html_url || ev.url,
          daysRemaining: diffDays,
          description: ev.description
            ? cleanHtmlToMarkdown(ev.description)
            : undefined,
        });
      }
    }
  } catch (e) {
    console.error("[EventsService] Error obteniendo upcoming events:", e);
  }

  // 3. Eventos de Calendario
  try {
    const nowIso = new Date().toISOString().split("T")[0];
    const calEvents = await getCalendarEvents(client, { startDate: nowIso });
    if (Array.isArray(calEvents)) {
      for (const ev of calEvents) {
        const dateStr = ev.start_at || ev.end_at;
        if (!dateStr) continue;
        const evDate = new Date(dateStr);
        const diffDays = Number(
          (
            (evDate.getTime() - Date.now()) /
            (1000 * 60 * 60 * 24)
          ).toFixed(1)
        );
        events.push({
          id: `cal_${ev.id}`,
          title: ev.title || "Evento de Calendario",
          date: dateStr,
          type: "event",
          courseName: cleanCourseTitle(
            ev.context_name || ev.context_code || ""
          ),
          htmlUrl: ev.html_url || ev.url,
          daysRemaining: diffDays,
        });
      }
    }
  } catch (e) {
    console.error("[EventsService] Error obteniendo calendar events:", e);
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
  return deduplicated.sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );
}
