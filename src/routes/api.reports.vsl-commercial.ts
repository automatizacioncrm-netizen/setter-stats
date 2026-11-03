import { createFileRoute } from "@tanstack/react-router";
import { commercialApi } from "@/server/api/vsl-commercial.api.server";
export const Route = createFileRoute("/api/reports/vsl-commercial")({
  server: { handlers: { GET: ({ request }) => commercialApi(request) } },
});
