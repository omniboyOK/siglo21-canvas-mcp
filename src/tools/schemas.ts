/**
 * Schemas de validación Zod para los inputs de las herramientas MCP.
 *
 * Centraliza la validación que antes se hacía manualmente con if/throw.
 */

import { z } from "zod";

export const CourseIdSchema = z.object({
  course_id: z.coerce.number({ required_error: "course_id es requerido" }),
});

export const ListCoursesSchema = z.object({
  include_concluded: z.boolean().optional(),
  search: z.string().optional(),
  compact: z.boolean().optional(),
});

export const AcademicStatusSchema = z.object({
  course_id: z.coerce.number({ required_error: "course_id es requerido" }),
  target_promo_grade: z.coerce.number().optional(),
  target_regular_grade: z.coerce.number().optional(),
});

export const AssignmentsSchema = z.object({
  course_id: z.coerce.number({ required_error: "course_id es requerido" }),
  clean_content: z.boolean().optional(),
});

export const ModulesSchema = z.object({
  course_id: z.coerce.number({ required_error: "course_id es requerido" }),
  clean_content: z.boolean().optional(),
});

export const ReadPdfSchema = z.object({
  file_id: z.coerce.number().optional(),
  download_url: z.string().optional(),
  max_pages: z.coerce.number().optional(),
});

export const GetReadingSchema = z.object({
  course_id: z.coerce.number({ required_error: "course_id es requerido" }),
  module_number: z.coerce.number({ required_error: "module_number es requerido" }),
  reading_number: z.coerce.number({ required_error: "reading_number es requerido" }),
  auto_read_pdf: z.boolean().optional(),
});

export const GenerateQuizSchema = z.object({
  course_id: z.coerce.number({ required_error: "course_id es requerido" }),
  module_number: z.coerce.number({ required_error: "module_number es requerido" }),
  reading_number: z.coerce.number({ required_error: "reading_number es requerido" }),
  question_count: z.coerce.number().optional(),
});

export const AuditRubricSchema = z.object({
  course_id: z.coerce.number({ required_error: "course_id es requerido" }),
  assignment_id: z.coerce.number({ required_error: "assignment_id es requerido" }),
  draft_text: z.string().min(1, "draft_text es requerido"),
});

export const SearchReadingsSchema = z.object({
  query: z.string().min(1, "query es requerido"),
});

export const AnnouncementsSchema = z.object({
  course_ids: z.array(z.coerce.number()).optional(),
});

export const PortalSchema = z.object({
  port: z.coerce.number().optional(),
  auto_open: z.boolean().optional(),
});

export const ExamSimulatorSchema = z.object({
  port: z.coerce.number().optional(),
  auto_open: z.boolean().optional(),
  course_id: z.coerce.number().optional(),
  mode: z.enum(["exam", "practice", "real_exam"]).optional(),
  start_exam: z.boolean().optional(),
});

export const SaveQuestionsSchema = z.object({
  course_id: z.coerce.number({ required_error: "course_id es requerido" }),
  course_name: z.string().min(1, "course_name es requerido"),
  questions: z
    .array(
      z.object({
        module_number: z.coerce.number(),
        reading_number: z.coerce.number().optional(),
        topic: z.string().optional(),
        question_text: z.string().min(1),
        options: z.array(z.string()).min(2),
        correct_option_index: z.coerce.number(),
        explanation: z.string().min(1),
        difficulty: z.enum(["easy", "medium", "hard"]).optional(),
      })
    )
    .min(1, "questions no puede estar vacío"),
});

export const BankQuestionsSchema = z.object({
  course_id: z.coerce.number({ required_error: "course_id es requerido" }),
  module_number: z.coerce.number().optional(),
  limit: z.coerce.number().optional(),
});
