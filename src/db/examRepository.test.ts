import { describe, it, before, beforeEach } from "node:test";
import assert from "node:assert/strict";

// Configuramos base de datos en memoria ANTES de inicializar la conexión
process.env.S21_DB_PATH = ":memory:";

import { ExamRepository } from "./examRepository.js";
import { getDb } from "./database.js";

describe("ExamRepository (SQLite en memoria)", () => {
  const testCourseId = 99999;
  const testCourseName = "Materia de Prueba Automatizada";

  before(() => {
    // Asegurar que el esquema se inicializa en memoria
    getDb();
  });

  beforeEach(() => {
    // Limpiar tablas para cada prueba
    const db = getDb();
    db.exec(`
      DELETE FROM attempt_answers;
      DELETE FROM exam_attempts;
      DELETE FROM questions;
      DELETE FROM courses;
    `);
  });

  it("debe registrar y actualizar una materia correctamente (upsertCourse)", () => {
    ExamRepository.upsertCourse({
      id: testCourseId,
      name: testCourseName,
      code: "TEST-01",
    });

    const courses = ExamRepository.getCoursesSummary();
    assert.strictEqual(courses.length, 1);
    assert.strictEqual(courses[0].id, testCourseId);
    assert.strictEqual(courses[0].name, testCourseName);
    assert.strictEqual(courses[0].code, "TEST-01");
  });

  it("debe guardar un lote de preguntas y calcular conteos por materia", () => {
    const questionsToSave = [
      {
        module_number: 1,
        reading_number: 1,
        topic: "Módulo 1 Tema 1",
        question_text: "¿Cuál es la respuesta correcta para M1?",
        options: ["Opción A", "Opción B", "Opción C", "Opción D"],
        correct_option_index: 0,
        explanation: "Justificación de prueba para M1",
      },
      {
        module_number: 2,
        reading_number: 1,
        topic: "Módulo 2 Tema 1",
        question_text: "¿Cuál es la respuesta correcta para M2?",
        options: ["Opción 1", "Opción 2", "Opción 3"],
        correct_option_index: 1,
        explanation: "Justificación de prueba para M2",
      },
    ];

    const res = ExamRepository.saveQuestions(testCourseId, testCourseName, questionsToSave);
    assert.strictEqual(res.insertedCount, 2);

    const questionsM1 = ExamRepository.getQuestions(testCourseId, 1);
    assert.strictEqual(questionsM1.length, 1);
    assert.strictEqual(questionsM1[0].correct_option_index, 0);
    assert.deepStrictEqual(questionsM1[0].options, ["Opción A", "Opción B", "Opción C", "Opción D"]);

    const allQuestions = ExamRepository.getQuestions(testCourseId);
    assert.strictEqual(allQuestions.length, 2);

    const limitedQuestions = ExamRepository.getQuestions(testCourseId, undefined, 1);
    assert.strictEqual(limitedQuestions.length, 1);

    const summary = ExamRepository.getCoursesSummary();
    assert.strictEqual(summary[0].question_count, 2);
    assert.deepStrictEqual(summary[0].modules, [1, 2]);
  });

  it("debe generar un simulacro aleatorio con los filtros solicitados", () => {
    // Insertamos 4 preguntas (dos en M1, dos en M2)
    ExamRepository.saveQuestions(testCourseId, testCourseName, [
      {
        module_number: 1,
        question_text: "Pregunta M1 A",
        options: ["A1", "A2"],
        correct_option_index: 0,
        explanation: "Exp",
      },
      {
        module_number: 1,
        question_text: "Pregunta M1 B",
        options: ["B1", "B2"],
        correct_option_index: 1,
        explanation: "Exp",
      },
      {
        module_number: 2,
        question_text: "Pregunta M2 A",
        options: ["C1", "C2"],
        correct_option_index: 0,
        explanation: "Exp",
      },
      {
        module_number: 2,
        question_text: "Pregunta M2 B",
        options: ["D1", "D2"],
        correct_option_index: 1,
        explanation: "Exp",
      },
    ]);

    // Generamos examen filtrando solo por Módulo 1
    const exam = ExamRepository.generateRandomExam(testCourseId, {
      modules: [1],
      count: 2,
      mode: "exam",
    });

    assert.ok(exam.attempt.id > 0);
    assert.strictEqual(exam.questions.length, 2);
    // Verificar que todas las preguntas sean del módulo 1
    for (const q of exam.questions) {
      assert.strictEqual(q.module_number, 1);
    }
  });

  it("debe calificar un examen con la escala 1-10 oficial de Siglo 21", () => {
    ExamRepository.saveQuestions(testCourseId, testCourseName, [
      {
        module_number: 1,
        question_text: "Q1",
        options: ["A", "B"],
        correct_option_index: 0,
        explanation: "E1",
      },
      {
        module_number: 1,
        question_text: "Q2",
        options: ["A", "B"],
        correct_option_index: 1,
        explanation: "E2",
      },
    ]);

    const exam = ExamRepository.generateRandomExam(testCourseId, { count: 2 });
    const attemptId = exam.attempt.id;
    const q1 = exam.questions[0];
    const q2 = exam.questions[1];

    // Caso 1: 100% de aciertos -> Nota 10, Aprobado y Promocionado
    // Obtenemos los índices correctos de cada pregunta
    const dbQuestions = ExamRepository.getQuestions(testCourseId);
    const correct1 = dbQuestions.find((q) => q.id === q1.id)!.correct_option_index;
    const correct2 = dbQuestions.find((q) => q.id === q2.id)!.correct_option_index;

    const result = ExamRepository.submitExamAttempt(attemptId, 60, [
      { question_id: q1.id, selected_option_index: correct1 },
      { question_id: q2.id, selected_option_index: correct2 },
    ]);

    assert.strictEqual(result.score, 10);
    assert.strictEqual(result.passed, true);
    assert.strictEqual(result.promoted, true);
    assert.strictEqual(result.correctCount, 2);
    assert.strictEqual(result.totalCount, 2);

    // Verificar que quedó registrado en el historial
    const history = ExamRepository.getCourseHistory(testCourseId);
    assert.strictEqual(history.length, 1);
    assert.strictEqual(history[0].score, 10);
    assert.strictEqual(history[0].passed, true);
  });

  it("debe eliminar preguntas e intentos individualmente", () => {
    ExamRepository.saveQuestions(testCourseId, testCourseName, [
      {
        module_number: 1,
        question_text: "Para eliminar",
        options: ["A", "B"],
        correct_option_index: 0,
        explanation: "Exp",
      },
    ]);

    const questions = ExamRepository.getQuestions(testCourseId);
    assert.strictEqual(questions.length, 1);
    const qId = questions[0].id;

    const deleted = ExamRepository.deleteQuestion(qId);
    assert.strictEqual(deleted, true);

    const questionsAfter = ExamRepository.getQuestions(testCourseId);
    assert.strictEqual(questionsAfter.length, 0);
  });
});
