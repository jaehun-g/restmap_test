"use client";

import {Button} from "@/components/ui/button";
import {clampPage, pageCount, tablePageSize} from "@/lib/pagination";

export default function TablePagination({
  total,
  page,
  onPageChange,
}: {
  total: number;
  page: number;
  onPageChange: (page: number) => void;
}) {
  const pages = pageCount(total);
  const current = clampPage(page, total);
  const first = total ? current * tablePageSize + 1 : 0;
  const last = Math.min(total, (current + 1) * tablePageSize);
  return (
    <nav
      className="table-pagination flex items-center justify-between gap-[8px] p-[8px_12px] text-[10px] [border-top:1px_solid_var(--line)] shrink-0"
      aria-label="목록 페이지 이동"
    >
      <Button
        type="button"
        disabled={current === 0}
        onClick={() => onPageChange(current - 1)}
        variant="secondary"
      >
        이전
      </Button>
      <span>
        {first}–{last} / {total} · {current + 1} / {pages}페이지
      </span>
      <Button
        type="button"
        disabled={current + 1 === pages}
        onClick={() => onPageChange(current + 1)}
        variant="secondary"
      >
        다음
      </Button>
    </nav>
  );
}
