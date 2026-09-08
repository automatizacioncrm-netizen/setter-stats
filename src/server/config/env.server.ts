import { z } from "zod";
export class ApiError extends Error {
  constructor(
    message: string,
    public status = 502,
  ) {
    super(message);
  }
}
export function getServerEnv() {
  const parsed = z
    .object({
      APPS_SCRIPT_URL: z
        .string()
        .url()
        .refine((v) => v.startsWith("https://")),
      APPS_SCRIPT_SECRET: z.string().trim().min(1),
    })
    .safeParse({
      APPS_SCRIPT_URL: process.env["APPS_SCRIPT_URL"],
      APPS_SCRIPT_SECRET: process.env["APPS_SCRIPT_SECRET"],
    });
  if (!parsed.success) {
    console.error(
      "Configuración privada de Apps Script incompleta o inválida: revisa APPS_SCRIPT_URL y APPS_SCRIPT_SECRET.",
    );
    throw new ApiError(
      "El servicio de reportes no está configurado. Contacta al administrador.",
      503,
    );
  }
  return parsed.data;
}
export function apiError(error: unknown) {
  return Response.json(
    { message: error instanceof ApiError ? error.message : "No se pudo procesar el reporte." },
    {
      status: error instanceof ApiError ? error.status : 500,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
