"use client";

import type { ReactNode } from "react";

import { EmptyState, ErrorState, LoadingRows } from "@/components/states";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { trpc } from "@/trpc/client";

/**
 * Client-side gate so a page renders an honest "you are signed in as the wrong
 * role" state instead of a wall of failed queries. It is *not* the access
 * control: every procedure re-checks role and ownership server-side.
 */
export function RoleGate({
  role,
  children,
}: {
  role: "admin" | "creator";
  children: ReactNode;
}) {
  const me = trpc.auth.me.useQuery();

  if (me.isPending) return <LoadingRows rows={3} label="Checking your session" />;
  if (me.isError) {
    return <ErrorState title="Could not read your session" error={me.error} onRetry={() => me.refetch()} />;
  }

  if (!me.data) {
    return (
      <EmptyState
        title="You are not signed in"
        description="Pick a user in the dev switcher at the top of the page to get a session."
      />
    );
  }

  if (me.data.role !== role) {
    return (
      <Alert>
        <AlertTitle>This page is for {role}s</AlertTitle>
        <AlertDescription>
          You are signed in as {me.data.email} ({me.data.role}). Switch to
          {role === "admin" ? " an admin" : " a creator"} account in the dev
          switcher above.
        </AlertDescription>
      </Alert>
    );
  }

  return <>{children}</>;
}
