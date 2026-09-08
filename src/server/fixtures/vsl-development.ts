import { ESTADOS_AGENDA, type SheetRow } from "../../types/reports";

export function developmentSheet() {
  const rows: SheetRow[] = [];
  const distribution = [
    ["Cinthia", [1, 9, 1, 1, 0, 0]],
    ["Evelyn", [11, 19, 3, 2, 0, 0]],
    ["Jimena", [6, 4, 11, 2, 0, 1]],
    ["Jose Luis", [31, 24, 10, 6, 1, 0]],
    ["Joseph", [6, 4, 14, 0, 1, 0]],
  ] as const;
  for (const [setter, counts] of distribution)
    counts.forEach((count, status) => {
      for (let i = 0; i < count; i++)
        rows.push({
          Secuencia: "VSL | CLOSERS",
          "Setter asignado": setter,
          Asignado: `Closer ${(i % 2) + 1}`,
          "Estado de agenda": ESTADOS_AGENDA[status],
          "Fecha de reunión": "2026-09-06",
          "Nombre contacto": `Contacto de ejemplo ${rows.length + 1}`,
          Telefono: `000${rows.length + 1}`,
          "Correo electrónico": `ejemplo${rows.length + 1}@example.com`,
          "VSL Origen": i % 2 ? "No agendado" : "Agendado automatico",
          Fase: "Ejemplo",
          Fuente: "Desarrollo",
        });
    });
  return { rows, updatedAt: "2026-09-06T15:42:00Z" };
}
