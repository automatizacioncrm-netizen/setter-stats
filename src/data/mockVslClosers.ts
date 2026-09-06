import { ESTADOS_AGENDA, type EstadoAgenda, type RawRecord } from "@/types/reports";

export const MOCK_SETTERS = ["Cinthia", "Evelyn", "Jimena", "Jose Luis", "Joseph"];

export const MOCK_UPDATED_AT = "2026-09-06T15:42:00Z";

// Distribución aproximada por estado (pesos) para generar registros de ejemplo.
const ESTADO_WEIGHTS: Record<EstadoAgenda, number> = {
  "Agendado CRM": 33,
  Asistió: 36,
  Cancelado: 23,
  "No show": 7,
  "Pendiente de agenda": 2,
  Reagendado: 1,
};

const WEIGHTED_ESTADOS: EstadoAgenda[] = ESTADOS_AGENDA.flatMap((estado) =>
  Array.from({ length: ESTADO_WEIGHTS[estado] }, () => estado),
);

// Generador determinista (sin aleatoriedad real) para mantener datos estables.
function pseudoRandom(seed: number) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function isoDate(daysAgo: number) {
  const base = new Date("2026-09-06T00:00:00Z");
  base.setUTCDate(base.getUTCDate() - daysAgo);
  return base.toISOString().slice(0, 10);
}

export const MOCK_VSL_CLOSERS_RECORDS: RawRecord[] = Array.from({ length: 168 }, (_, i) => {
  const setter = MOCK_SETTERS[Math.floor(pseudoRandom(i + 1) * MOCK_SETTERS.length)];
  const estado = WEIGHTED_ESTADOS[Math.floor(pseudoRandom(i + 101) * WEIGHTED_ESTADOS.length)];
  const daysAgo = Math.floor(pseudoRandom(i + 501) * 32);
  return {
    id: `opp-${i + 1}`,
    fechaReunion: isoDate(daysAgo),
    setter,
    estadoAgenda: estado,
  };
});
