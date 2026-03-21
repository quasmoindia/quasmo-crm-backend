/** Support older records that only stored igstRate / igstAmount */
export function effectiveGstRate(inv: { gstRate?: number; igstRate?: number }): number {
  const r = Number(inv.gstRate ?? inv.igstRate ?? 0);
  return Math.min(100, Math.max(0, r));
}
