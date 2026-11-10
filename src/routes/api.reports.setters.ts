import { createFileRoute } from "@tanstack/react-router";
import { settersApi } from "@/server/api/setters.api.server";

export const Route = createFileRoute("/api/reports/setters")({
  server: { handlers: { GET: ({ request }) => settersApi(request) } },
});
