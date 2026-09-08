/**
 * Retrocompatibilidad: Re-exportación desde la nueva arquitectura modular de Canvas.
 * @deprecated Usar import from "./canvas/client.js" y los servicios correspondientes.
 */

export { CanvasClient, type CanvasClientConfig } from "./canvas/client.js";
export {
  cleanCourseTitle,
  extractCourseDates,
  extractCourseYear,
} from "./canvas/utils.js";
export {
  getSelf,
  getCourses,
  getCourse,
  getAcademicStatus,
  getPendingTasks,
  type CourseListOptions,
  type CompactCourse,
  type EnhancedCourseItem,
  type AcademicStatusResult,
} from "./canvas/courses.service.js";
export {
  getModules,
  getAssignments,
  getCourseFiles,
  getFileInfo,
  findReading,
  getCourseReadingsCatalog,
  auditAssignmentRubric,
  getDiscussionTopics,
  getSyllabus,
  getAnnouncements,
} from "./canvas/content.service.js";
export {
  getUpcomingEvents,
  getCalendarEvents,
  getUnifiedUpcomingEvents,
  type UpcomingEventItem,
} from "./canvas/events.service.js";
export {
  getStudentDashboard,
  type StudentDashboardData,
} from "./canvas/dashboard.service.js";
