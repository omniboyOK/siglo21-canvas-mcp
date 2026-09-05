/**
 * Entidades y tipos de dominio del ecosistema Siglo 21 Canvas & Exámenes.
 */

export interface Course {
  id: string;
  name: string;
  code: string;
  current_grade?: number | null;
  workflow_state?: string;
}

export interface Question {
  id?: number;
  course_id: string;
  module_number: number;
  reading_number?: number | null;
  prompt: string;
  option_a: string;
  option_b: string;
  option_c?: string | null;
  option_d?: string | null;
  correct_option: 'A' | 'B' | 'C' | 'D';
  explanation?: string | null;
  is_verified?: number;
  created_at?: string;
}

export interface ExamAttempt {
  id?: number;
  course_id: string;
  student_name: string;
  exam_type: 'API' | 'INTEGRADOR' | 'FINAL' | 'RETRY_FAILURES';
  attempt_number: number;
  score?: number | null;
  is_passed?: number | null;
  duration_seconds?: number | null;
  feedback_summary?: string | null;
  created_at?: string;
}

export interface AttemptAnswer {
  id?: number;
  attempt_id: number;
  question_id: number;
  selected_option: string;
  is_correct: number;
}

export interface McpTool {
  name: string;
  category: 'Canvas' | 'Lecturas' | 'Exámenes' | 'Sistema';
  description: string;
  examplePrompt: string;
  tags: string[];
}

export interface ExamGenerationOptions {
  courseId: string;
  questionCount: number;
  modules?: number[];
  examType?: 'API' | 'INTEGRADOR' | 'FINAL';
  studentName?: string;
}

export interface ExamSubmissionPayload {
  attemptId: number;
  durationSeconds?: number;
  answers: Array<{
    questionId: number;
    selectedOption: string;
  }>;
}
