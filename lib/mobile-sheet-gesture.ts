export function detailSheetSwipe(
  start: {x: number; y: number; canCollapse: boolean},
  end: {x: number; y: number},
): "expand" | "collapse" | null {
  const deltaY = end.y - start.y;
  if (Math.abs(deltaY) <= 50 || Math.abs(end.x - start.x) >= Math.abs(deltaY)) return null;
  if (deltaY < 0) return "expand";
  return start.canCollapse ? "collapse" : null;
}
