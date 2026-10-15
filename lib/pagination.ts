export const tablePageSize = 50;

export function pageCount(total: number, pageSize = tablePageSize) {
  return Math.max(1, Math.ceil(total / pageSize));
}

export function clampPage(page: number, total: number, pageSize = tablePageSize) {
  return Math.min(Math.max(0, page), pageCount(total, pageSize) - 1);
}

export function pageForIndex(index: number, pageSize = tablePageSize) {
  return index < 0 ? 0 : Math.floor(index / pageSize);
}

export function pageItems<T>(items: T[], page: number, pageSize = tablePageSize) {
  const current = clampPage(page, items.length, pageSize);
  return items.slice(current * pageSize, (current + 1) * pageSize);
}
