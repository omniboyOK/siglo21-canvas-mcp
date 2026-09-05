import { ExamRepository } from "../dist/db/examRepository.js";
import { getDb } from "../dist/db/database.js";

async function seed() {
  const db = getDb();

  // Limpiar posibles IDs de prueba
  db.exec(`
    DELETE FROM courses WHERE id IN (8888, 99999);
  `);

  const courseId = 34584;
  const courseName = "Ingeniería de Software y Arquitectura";

  ExamRepository.upsertCourse({
    id: courseId,
    name: courseName,
    code: "ING-SW-34584",
  });

  const questions = [
    {
      module_number: 1,
      reading_number: 1,
      topic: "Patrones de Arquitectura",
      question_text: "¿Cuál es el objetivo principal del patrón Arquitectura en Capas (Layered Architecture)?",
      options: [
        "Separar las responsabilidades del sistema en niveles aislados donde cada capa brinda servicios a la superior.",
        "Garantizar que todas las llamadas a la base de datos se ejecuten de manera asíncrona mediante hilos de ejecución.",
        "Eliminar por completo la necesidad de un modelo relacional de datos en la aplicación.",
        "Permitir la comunicación bidireccional no restringida entre la interfaz de usuario y la persistencia."
      ],
      correct_option_index: 0,
      explanation: "El patrón en capas organiza los componentes en grupos horizontales donde cada capa tiene un rol específico y desacoplado, promoviendo alta cohesión y bajo acoplamiento.",
      difficulty: "medium"
    },
    {
      module_number: 1,
      reading_number: 2,
      topic: "Clean Architecture",
      question_text: "En Clean Architecture y Arquitectura Hexagonal, ¿hacia dónde deben apuntar siempre las dependencias según la 'Regla de Dependencia'?",
      options: [
        "Hacia afuera, desde las entidades del negocio hacia los frameworks y la base de datos.",
        "Hacia adentro, apuntando hacia las entidades y reglas de negocio de alto nivel.",
        "Horizontalmente, conectando únicamente controladores entre sí.",
        "Hacia los servicios de infraestructura externos en la nube."
      ],
      correct_option_index: 1,
      explanation: "La regla de dependencia establece que el código fuente solo puede apuntar hacia adentro, hacia políticas de mayor nivel de abstracción (Dominio/Entidades), aislando las reglas del negocio de los detalles tecnológicos.",
      difficulty: "hard"
    },
    {
      module_number: 2,
      reading_number: 1,
      topic: "Diagrama de Clases UML",
      question_text: "En un diagrama de clases UML, ¿qué representa una relación de Composición (rombo relleno)?",
      options: [
        "Una relación débil donde las partes pueden existir independientemente del objeto contenedor.",
        "Una relación fuerte de pertenencia donde el ciclo de vida de las partes depende estrictamente del objeto contenedor.",
        "Una relación de herencia múltiple entre dos interfaces.",
        "Una dependencia temporal que solo existe durante la ejecución de un método."
      ],
      correct_option_index: 1,
      explanation: "La composición es una forma estricta de agregación donde los objetos parte no tienen sentido ni ciclo de vida fuera del objeto todo que los contiene (ej: Factura y Líneas de Factura).",
      difficulty: "medium"
    },
    {
      module_number: 2,
      reading_number: 2,
      topic: "Diagrama de Secuencia UML",
      question_text: "En un diagrama de secuencias UML, ¿qué elemento representa el tiempo durante el cual un objeto está realizando una acción o esperando respuesta?",
      options: [
        "La línea de vida (Lifeline).",
        "La barra de activación (Activation Bar).",
        "El mensaje síncrono (Solid Arrowhead).",
        "El marco de interacción (Interaction Frame)."
      ],
      correct_option_index: 1,
      explanation: "La barra de activación (rectángulo delgado vertical sobre la línea de vida) representa el período en el cual un objeto ejecuta una operación activa.",
      difficulty: "easy"
    },
    {
      module_number: 3,
      reading_number: 1,
      topic: "Principios SOLID",
      question_text: "El Principio de Inversión de Dependencias (DIP) en SOLID establece principalmente que:",
      options: [
        "Los módulos de alto nivel no deben depender de módulos de bajo nivel; ambos deben depender de abstracciones.",
        "Una clase debe tener una y solo una razón para cambiar.",
        "Las clases derivadas deben poder sustituir a sus clases base sin alterar el comportamiento esperado.",
        "Los clientes no deben ser forzados a depender de interfaces que no utilizan."
      ],
      correct_option_index: 0,
      explanation: "El DIP indica que los módulos de alto nivel no deben depender de los detalles de bajo nivel, sino que ambos deben depender de contratos o interfaces abstractas.",
      difficulty: "medium"
    }
  ];

  // Verificar si ya existen preguntas para no duplicar
  const existing = ExamRepository.getQuestions(courseId);
  if (existing.length === 0) {
    ExamRepository.saveQuestions(courseId, courseName, questions);
    console.log(`[Seed] Guardadas ${questions.length} preguntas en ${courseName}.`);
  } else {
    console.log(`[Seed] ${courseName} ya cuenta con ${existing.length} preguntas.`);
  }
}

seed().catch(console.error);
