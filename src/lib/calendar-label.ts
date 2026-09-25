const calendarLabels: Record<string, string> = {
  "Llamada de Claridad CM [A]": "VSL PAGADO - CIRCULO",
  "Llamada de Claridad CM [ORG]": "ORGANICO - CIRCULO",
  "Sesión Equipo Millonario (A)": "VSL PAGADO - EQUIPO",
  "Sesión Equipo Millonario (ORG)": "ORGANICO - EQUIPO",
};

export function calendarLabel(value: string): string {
  return calendarLabels[value] ?? value;
}
