import { createFileRoute } from "@tanstack/react-router";
import { consultantsApi } from "@/server/api/consultants.api.server";
export const Route = createFileRoute("/api/reports/consultores")({
  server: { handlers: { GET: ({ request }) => consultantsApi(request) } },
});
