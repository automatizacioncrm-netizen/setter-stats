export function getSalesStageStyle(stage: string) {
  if (stage === "Reserva / Deposito")
    return { accent: "#a16207", badge: "border-yellow-300 bg-yellow-50 text-yellow-900" };
  if (stage === "Perdida")
    return { accent: "#dc2626", badge: "border-red-300 bg-red-50 text-red-900" };
  if (stage.includes("Venta"))
    return { accent: "#15803d", badge: "border-green-300 bg-green-50 text-green-900" };
  return { accent: "#64748b", badge: "border-slate-300 bg-slate-50 text-slate-900" };
}
