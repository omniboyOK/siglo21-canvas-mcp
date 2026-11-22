import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  AcademicStatusSchema,
  AnnouncementsSchema,
  AuditRubricSchema,
  BankQuestionsSchema,
  CourseIdSchema,
  ExamSimulatorSchema,
  GenerateQuizSchema,
  GetReadingPdfSchema,
  GetReadingSchema,
  ListCoursesSchema,
  PortalSchema,
  ReadPdfSchema,
  SaveQuestionsSchema,
  SearchReadingsSchema,
} from "./schemas.js";

describe("MCP Tool Input Schemas (Zod v4)", () => {
  it("debe coercionar strings numéricos en los schemas de curso y lectura", () => {
    assert.deepStrictEqual(CourseIdSchema.parse({ course_id: "1234" }), {
      course_id: 1234,
    });

    assert.deepStrictEqual(
      GetReadingSchema.parse({
        course_id: "101",
        module_number: "2",
        reading_number: "3",
        auto_read_pdf: true,
      }),
      {
        course_id: 101,
        module_number: 2,
        reading_number: 3,
        auto_read_pdf: true,
      }
    );

    assert.deepStrictEqual(
      GetReadingPdfSchema.parse({
        course_id: "202",
        module_number: "1",
        reading_number: "4",
      }),
      {
        course_id: 202,
        module_number: 1,
        reading_number: 4,
      }
    );

    assert.deepStrictEqual(
      GenerateQuizSchema.parse({
        course_id: "303",
        module_number: "4",
        reading_number: "2",
        question_count: "5",
      }),
      {
        course_id: 303,
        module_number: 4,
        reading_number: 2,
        question_count: 5,
      }
    );

    assert.deepStrictEqual(
      AuditRubricSchema.parse({
        course_id: "404",
        assignment_id: "99",
        draft_text: "Borrador de entrega de prueba",
      }),
      {
        course_id: 404,
        assignment_id: 99,
        draft_text: "Borrador de entrega de prueba",
      }
    );

    assert.deepStrictEqual(
      AnnouncementsSchema.parse({ course_ids: ["10", "20"] }),
      { course_ids: [10, 20] }
    );

    assert.deepStrictEqual(
      BankQuestionsSchema.parse({
        course_id: "505",
        module_number: "1",
        limit: "10",
      }),
      {
        course_id: 505,
        module_number: 1,
        limit: 10,
      }
    );

    const saved = SaveQuestionsSchema.parse({
      course_id: "606",
      course_name: "Materia Sintética",
      questions: [
        {
          module_number: "1",
          reading_number: "2",
          question_text: "¿Pregunta de prueba?",
          options: ["Opción A", "Opción B"],
          correct_option_index: "0",
          explanation: "Justificación sintética",
          difficulty: "medium",
        },
      ],
    });
    assert.strictEqual(saved.course_id, 606);
    assert.strictEqual(saved.questions[0].module_number, 1);
    assert.strictEqual(saved.questions[0].reading_number, 2);
    assert.strictEqual(saved.questions[0].correct_option_index, 0);
  });

  it("debe mantener campos opcionales como undefined cuando se omiten", () => {
    assert.deepStrictEqual(ListCoursesSchema.parse({}), {});
    assert.deepStrictEqual(ReadPdfSchema.parse({}), {});
    assert.deepStrictEqual(PortalSchema.parse({}), {});
    assert.deepStrictEqual(ExamSimulatorSchema.parse({}), {});
    assert.deepStrictEqual(AcademicStatusSchema.parse({ course_id: 100 }), {
      course_id: 100,
    });
    assert.strictEqual(
      GetReadingPdfSchema.parse({
        course_id: 100,
        module_number: 1,
        reading_number: 1,
      }).output_dir,
      undefined
    );
  });

  it("debe reportar mensajes de validación en español cuando faltan campos obligatorios", () => {
    const missingCourse = CourseIdSchema.safeParse({});
    assert.strictEqual(missingCourse.success, false);
    assert.strictEqual(
      missingCourse.error.issues[0].message,
      "course_id es requerido"
    );

    const missingReading = GetReadingSchema.safeParse({
      course_id: 1,
      module_number: 2,
    });
    assert.strictEqual(missingReading.success, false);
    assert.strictEqual(
      missingReading.error.issues[0].message,
      "reading_number es requerido"
    );

    const emptyDraft = AuditRubricSchema.safeParse({
      course_id: 1,
      assignment_id: 2,
      draft_text: "",
    });
    assert.strictEqual(emptyDraft.success, false);
    assert.strictEqual(
      emptyDraft.error.issues[0].message,
      "draft_text es requerido"
    );

    const emptyQuery = SearchReadingsSchema.safeParse({ query: "" });
    assert.strictEqual(emptyQuery.success, false);
    assert.strictEqual(
      emptyQuery.error.issues[0].message,
      "query es requerido"
    );

    const emptyQuestions = SaveQuestionsSchema.safeParse({
      course_id: 1,
      course_name: "Test",
      questions: [],
    });
    assert.strictEqual(emptyQuestions.success, false);
    assert.strictEqual(
      emptyQuestions.error.issues[0].message,
      "questions no puede estar vacío"
    );
  });

  it("debe rechazar valores fuera de enum en ExamSimulatorSchema y SaveQuestionsSchema", () => {
    const invalidMode = ExamSimulatorSchema.safeParse({ mode: "invalid" });
    assert.strictEqual(invalidMode.success, false);

    const invalidDifficulty = SaveQuestionsSchema.safeParse({
      course_id: 1,
      course_name: "Test",
      questions: [
        {
          module_number: 1,
          question_text: "¿Pregunta?",
          options: ["A", "B"],
          correct_option_index: 0,
          explanation: "Explicación",
          difficulty: "impossible",
        },
      ],
    });
    assert.strictEqual(invalidDifficulty.success, false);
  });
});
