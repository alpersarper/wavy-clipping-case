"use client";

import Link from "next/link";

import { EmptyState, ErrorState, LoadingRows } from "@/components/states";
import { Button } from "@/components/ui/button";
import { trpc } from "@/trpc/client";

/** Sends whoever is signed in to the screens their role can actually use. */
export default function Home() {
  const me = trpc.auth.me.useQuery();

  if (me.isPending) return <LoadingRows rows={2} label="Checking your session" />;
  if (me.isError) {
    return (
      <ErrorState
        title="Could not read your session"
        error={me.error}
        onRetry={() => me.refetch()}
      />
    );
  }

  if (!me.data) {
    return (
      <EmptyState
        title="You are not signed in"
        description="This build uses a dev-only user switcher instead of real authentication. Pick an admin or a creator at the top of the page."
      />
    );
  }

  const links =
    me.data.role === "admin"
      ? [{ href: "/admin/campaigns", label: "Campaigns" }]
      : [
          { href: "/creator/campaigns", label: "Browse campaigns" },
          { href: "/creator/submissions", label: "My submissions" },
        ];

  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Wavy Clipping</h1>
        <p className="text-sm text-muted-foreground">
          Signed in as {me.data.email} ({me.data.role}).
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {links.map((link) => (
          <Button key={link.href} asChild variant="outline">
            <Link href={link.href}>{link.label}</Link>
          </Button>
        ))}
      </div>
    </section>
  );
}
