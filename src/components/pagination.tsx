"use client";

import { Button } from "@/components/ui/button";

/**
 * Server-side pagination control. It only reports and moves the page number;
 * the slicing happens in Postgres (`campaign.list`, `submission.mine`,
 * `submission.reviewQueue`).
 */
export function Pagination({
  page,
  pageCount,
  total,
  noun,
  onChange,
  busy = false,
}: {
  page: number;
  pageCount: number;
  total: number;
  /** Singular noun for the row count, e.g. "campaign". */
  noun: string;
  onChange: (page: number) => void;
  busy?: boolean;
}) {
  return (
    <nav
      aria-label={`${noun} pagination`}
      className="flex flex-wrap items-center justify-between gap-3"
    >
      <p className="text-sm text-muted-foreground" aria-live="polite">
        Page {page} of {pageCount} · {total} {noun}
        {total === 1 ? "" : "s"}
        {busy ? " · updating…" : ""}
      </p>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
        >
          Previous<span className="sr-only"> page</span>
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={page >= pageCount}
          onClick={() => onChange(page + 1)}
        >
          Next<span className="sr-only"> page</span>
        </Button>
      </div>
    </nav>
  );
}
