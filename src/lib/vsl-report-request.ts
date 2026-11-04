/** Same-origin proxy request; browser and server have separate error categories. */
export async function fetchVslReportJson(url: string, signal: AbortSignal): Promise<unknown> {
  const timeout = AbortSignal.timeout(75000);
  try {
    const response = await fetch(url, {
      signal: AbortSignal.any([signal, timeout]),
      cache: "no-store",
    });
    let body: unknown;
    try {
      body = await response.json();
    } catch (error) {
      if (signal.aborted || timeout.aborted) throw error;
      throw new Error(
        `El endpoint interno respondió HTTP ${response.status} con JSON vacío o inválido.`,
      );
    }
    if (!response.ok)
      throw new Error(
        body && typeof body === "object" && "error" in body && typeof body.error === "string"
          ? body.error
          : `El endpoint interno respondió HTTP ${response.status}.`,
      );
    return body;
  } catch (error) {
    if (signal.aborted)
      throw new DOMException(
        "La consulta fue cancelada al cambiar de vista o filtro.",
        "AbortError",
      );
    if (timeout.aborted)
      throw new Error("La consulta al servidor excedió el tiempo de espera de 75 segundos.");
    if (error instanceof TypeError)
      throw new Error(
        "Error de red al consultar el servidor de la aplicación. Revisa la conexión; el navegador no consulta Google directamente.",
      );
    throw error;
  }
}
