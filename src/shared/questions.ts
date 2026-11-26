// Banco inicial de 30 preguntas de cultura general en español (fácil de editar)
// y utilidades de normalización y carga de preguntas personalizadas.

import type { Question } from './types.ts';

export const DEFAULT_QUESTIONS: Question[] = [
  // Geografía (6)
  {
    id: 'geo-1',
    category: 'Geografía',
    prompt: '¿Cuál es la capital de Colombia?',
    answers: ['bogota', 'bogotá', 'bogota d.c.', 'bogota dc'],
  },
  {
    id: 'geo-2',
    category: 'Geografía',
    prompt: '¿Cuál es el río más largo de América del Sur?',
    answers: ['amazonas', 'el amazonas', 'rio amazonas', 'río amazonas'],
  },
  {
    id: 'geo-3',
    category: 'Geografía',
    prompt: '¿En qué continente se encuentra Egipto?',
    answers: ['africa', 'áfrica'],
  },
  {
    id: 'geo-4',
    category: 'Geografía',
    prompt: '¿Cuál es el océano más grande de la Tierra?',
    answers: ['pacifico', 'pacífico', 'oceano pacifico', 'océano pacífico'],
  },
  {
    id: 'geo-5',
    category: 'Geografía',
    prompt: '¿Cuál es la capital de Japón?',
    answers: ['tokio', 'tokyo'],
  },
  {
    id: 'geo-6',
    category: 'Geografía',
    prompt: '¿Qué cordillera recorre el oeste de América del Sur de norte a sur?',
    answers: ['andes', 'los andes', 'cordillera de los andes'],
  },

  // Ciencia (6)
  {
    id: 'sci-1',
    category: 'Ciencia',
    prompt: '¿Cuál es el símbolo químico del agua?',
    answers: ['h2o'],
  },
  {
    id: 'sci-2',
    category: 'Ciencia',
    prompt: '¿Qué planeta es conocido como el planeta rojo?',
    answers: ['marte'],
  },
  {
    id: 'sci-3',
    category: 'Ciencia',
    prompt: '¿Cuál es el órgano principal encargado de bombear sangre en el cuerpo humano?',
    answers: ['corazon', 'corazón', 'el corazon', 'el corazón'],
  },
  {
    id: 'sci-4',
    category: 'Ciencia',
    prompt: '¿Qué gas respiramos principalmente los seres humanos para vivir?',
    answers: ['oxigeno', 'oxígeno', 'o2'],
  },
  {
    id: 'sci-5',
    category: 'Ciencia',
    prompt: '¿Cuántos planetas tiene el sistema solar actualmente reconocidos?',
    answers: ['8', 'ocho'],
  },
  {
    id: 'sci-6',
    category: 'Ciencia',
    prompt: '¿Cómo se llama el proceso por el cual las plantas producen su alimento usando la luz del sol?',
    answers: ['fotosintesis', 'fotosíntesis', 'la fotosintesis'],
  },

  // Historia (6)
  {
    id: 'his-1',
    category: 'Historia',
    prompt: '¿En qué año llegó Cristóbal Colón a América?',
    answers: ['1492'],
  },
  {
    id: 'his-2',
    category: 'Historia',
    prompt: '¿Qué antigua civilización construyó las pirámides de Guiza?',
    answers: ['egipcios', 'egipcia', 'egipto', 'los egipcios', 'antiguo egipto'],
  },
  {
    id: 'his-3',
    category: 'Historia',
    prompt: '¿Quién fue el primer ser humano en caminar sobre la Luna?',
    answers: ['neil armstrong', 'armstrong'],
  },
  {
    id: 'his-4',
    category: 'Historia',
    prompt: '¿Qué civilización precolombina construyó Machu Picchu?',
    answers: ['incas', 'inca', 'los incas', 'imperio inca'],
  },
  {
    id: 'his-5',
    category: 'Historia',
    prompt: '¿En qué ciudad se cayó el famoso muro que dividía Alemania en 1989?',
    answers: ['berlin', 'berlín'],
  },
  {
    id: 'his-6',
    category: 'Historia',
    prompt: '¿Quién pintó la famosa obra "La Mona Lisa"?',
    answers: ['leonardo da vinci', 'da vinci', 'leonardo'],
  },

  // Deportes (6)
  {
    id: 'dep-1',
    category: 'Deportes',
    prompt: '¿Cuántos jugadores tiene en cancha un equipo de fútbol profesional al iniciar un partido?',
    answers: ['11', 'once'],
  },
  {
    id: 'dep-2',
    category: 'Deportes',
    prompt: '¿Cada cuántos años se celebran los Juegos Olímpicos de Verano?',
    answers: ['4', 'cuatro', '4 anos', '4 años', 'cuatro años'],
  },
  {
    id: 'dep-3',
    category: 'Deportes',
    prompt: '¿En qué deporte se utiliza una raqueta y una pelota amarilla sobre césped, arcilla o pista dura?',
    answers: ['tenis'],
  },
  {
    id: 'dep-4',
    category: 'Deportes',
    prompt: '¿Qué selección nacional ganó el Mundial de Fútbol de Catar 2022?',
    answers: ['argentina'],
  },
  {
    id: 'dep-5',
    category: 'Deportes',
    prompt: '¿Cuántos puntos vale un tiro libre encestado en baloncesto?',
    answers: ['1', 'uno', 'un punto', '1 punto'],
  },
  {
    id: 'dep-6',
    category: 'Deportes',
    prompt: '¿En qué país nació el famoso futbolista Pelé?',
    answers: ['brasil', 'brazil'],
  },

  // Cultura y Artes (6)
  {
    id: 'cul-1',
    category: 'Cultura',
    prompt: '¿Quién escribió la novela "Cien años de soledad"?',
    answers: ['gabriel garcia marquez', 'gabriel garcía márquez', 'garcia marquez', 'gabo'],
  },
  {
    id: 'cul-2',
    category: 'Cultura',
    prompt: '¿Cuántas cuerdas tiene normalmente una guitarra clásica española?',
    answers: ['6', 'seis'],
  },
  {
    id: 'cul-3',
    category: 'Cultura',
    prompt: '¿Quién escribió "Don Quijote de la Mancha"?',
    answers: ['miguel de cervantes', 'cervantes', 'miguel de cervantes saavedra'],
  },
  {
    id: 'cul-4',
    category: 'Cultura',
    prompt: '¿Cuál es el idioma oficial de Brasil?',
    answers: ['portugues', 'portugués'],
  },
  {
    id: 'cul-5',
    category: 'Cultura',
    prompt: '¿De qué país es originario el tango?',
    answers: ['argentina', 'uruguay', 'argentina y uruguay'],
  },
  {
    id: 'cul-6',
    category: 'Cultura',
    prompt: '¿Cuántos colores tiene el arcoíris tradicionalmente?',
    answers: ['7', 'siete'],
  },
];

/**
 * Normaliza una respuesta de texto libre:
 * - Convierte a minúsculas
 * - Elimina tildes y diacríticos (á -> a, ü -> u, ñ -> n)
 * - Elimina signos de puntuación
 * - Colapsa múltiples espacios en uno solo
 */
export function normalizeAnswer(raw: string): string {
  return raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[.,;:¡!¿?'"()\[\]{}\-_/\\@#$%^&*+=~`<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Verifica si la respuesta del jugador coincide con alguna respuesta válida de la pregunta.
 */
export function isAnswerCorrect(userInput: string, validAnswers: string[]): boolean {
  const normalizedInput = normalizeAnswer(userInput);
  if (!normalizedInput) return false;
  return validAnswers.some((ans) => normalizeAnswer(ans) === normalizedInput);
}

/**
 * Parsea texto pegado por el anfitrión en formato:
 * "pregunta | respuesta1 ; respuesta2" (una por línea).
 */
export function parseCustomQuestions(rawText: string): {
  questions: Question[];
  invalidLines: number[];
} {
  const lines = rawText.split(/\r?\n/);
  const questions: Question[] = [];
  const invalidLines: number[] = [];

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    const pipeIndex = trimmed.indexOf('|');
    if (pipeIndex === -1) {
      invalidLines.push(index + 1);
      return;
    }

    const prompt = trimmed.slice(0, pipeIndex).trim();
    const answersPart = trimmed.slice(pipeIndex + 1).trim();

    if (!prompt || !answersPart) {
      invalidLines.push(index + 1);
      return;
    }

    const answers = answersPart
      .split(';')
      .map((a) => a.trim())
      .filter((a) => a.length > 0 && normalizeAnswer(a).length > 0);

    if (answers.length === 0) {
      invalidLines.push(index + 1);
      return;
    }

    questions.push({
      id: `custom-${Date.now()}-${index}`,
      category: 'Personalizada',
      prompt,
      answers,
    });
  });

  return { questions, invalidLines };
}
