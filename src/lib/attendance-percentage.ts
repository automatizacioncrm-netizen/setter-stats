/** API percentages are already on a 0–100 scale. Missing denominators stay unavailable. */
export function attendancePercentage(
  api: number | null | undefined,
  attended: number,
  booked: number | undefined,
): number | null {
  if (booked === 0) return 0;
  if (typeof api === "number" && Number.isFinite(api) && api >= 0) return api;
  if (
    booked === undefined ||
    !Number.isFinite(booked) ||
    booked < 0 ||
    !Number.isFinite(attended) ||
    attended < 0
  )
    return null;
  const percentage = (attended / booked) * 100;
  return Number.isFinite(percentage) ? Number(percentage.toFixed(2)) : null;
}
