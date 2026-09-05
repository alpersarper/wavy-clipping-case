"use client";

import type { ReactNode } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * The three states every list and detail in this app has to render.
 *
 * They are components rather than inline markup so that "loading", "empty" and
 * "failed" look and announce the same way everywhere: a polite live region
 * while loading, `role="alert"` on failure, and a retry that re-runs the query.
 */

export function LoadingRows({
  rows = 3,
  label = "Loading",
}: {
  rows?: number;
  label?: string;
}) {
  return (
    <div role="status" aria-live="polite" className="space-y-2">
      <span className="sr-only">{label}…</span>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-9 w-full" aria-hidden="true" />
      ))}
    </div>
  );
}

export function LoadingBlock({
  label = "Loading",
  className = "h-32 w-full",
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">{label}…</span>
      <Skeleton className={className} aria-hidden="true" />
    </div>
  );
}

export function ErrorState({
  title = "Something went wrong",
  error,
  onRetry,
}: {
  title?: string;
  error: unknown;
  onRetry?: () => void;
}) {
  const message =
    error instanceof Error && error.message ? error.message : "Unexpected error.";

  return (
    <Alert variant="destructive">
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>
        <p>{message}</p>
        {onRetry ? (
          <Button type="button" variant="outline" size="sm" onClick={onRetry}>
            Try again
          </Button>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}

export function EmptyState({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-dashed px-4 py-10 text-center">
      <p className="font-medium">{title}</p>
      {description ? (
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      ) : null}
      {children ? <div className="mt-4 flex justify-center">{children}</div> : null}
    </div>
  );
}
