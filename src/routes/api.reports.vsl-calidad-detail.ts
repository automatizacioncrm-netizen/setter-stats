import { createFileRoute } from "@tanstack/react-router";
import { surveyDetailApi } from "@/server/api/vsl-survey-detail.api.server";
export const Route = createFileRoute("/api/reports/vsl-calidad-detail")({
  server: { handlers: { GET: ({ request }) => surveyDetailApi(request) } },
});
