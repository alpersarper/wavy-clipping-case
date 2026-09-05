"use client";

import { trpc } from "@/trpc/client";

/**
 * Dev-only identity switcher (case section 4.1). Picking a user asks the server
 * for a signed cookie; it grants nothing on its own, since every procedure
 * re-checks role and ownership.
 *
 * A plain `<select>` on purpose: it is keyboard- and screen-reader-native, and
 * this control is scaffolding, not product.
 */
export function UserSwitcher() {
  const utils = trpc.useUtils();
  const me = trpc.auth.me.useQuery();
  const users = trpc.auth.users.useQuery();
  const switchUser = trpc.auth.switchUser.useMutation({
    onSuccess: () => utils.invalidate(),
  });

  return (
    <div className="flex items-center gap-2">
      <span
        className="rounded-md border border-dashed px-1.5 py-0.5 text-[0.65rem] font-medium tracking-wide text-muted-foreground uppercase"
        aria-hidden="true"
      >
        Dev
      </span>
      <label htmlFor="user-switcher" className="text-sm text-muted-foreground">
        <span className="sr-only">Dev-only user switcher. </span>
        Signed in as
      </label>
      <select
        id="user-switcher"
        data-testid="user-switcher"
        aria-describedby="user-switcher-hint"
        className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-50"
        value={me.data?.id ?? ""}
        disabled={switchUser.isPending || users.isPending}
        onChange={(event) => switchUser.mutate({ userId: event.target.value })}
      >
        <option value="" disabled>
          Not signed in
        </option>
        {users.data?.map((user) => (
          <option key={user.id} value={user.id}>
            {user.email} ({user.role})
          </option>
        ))}
      </select>
      <p id="user-switcher-hint" className="sr-only">
        Development shortcut that stands in for signing in. It is not real
        authentication.
      </p>
      {users.isError ? (
        <p role="alert" className="text-sm text-destructive">
          Could not load users.
        </p>
      ) : null}
    </div>
  );
}
