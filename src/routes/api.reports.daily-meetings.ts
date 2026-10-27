import { createFileRoute } from "@tanstack/react-router";
import { dailyMeetingsApi } from "@/server/api/daily-meetings.api.server";
export const Route = createFileRoute("/api/reports/daily-meetings")({
  server: { handlers: { GET: ({ request }) => dailyMeetingsApi(request) } },
});
