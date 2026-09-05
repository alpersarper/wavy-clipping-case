"use client";

import { trpc } from "@/trpc/client";

/**
 * Dev-only identity switcher (case section 4.1). Picking a user asks the server
 * for a signed cookie; it grants nothing on its own, since every procedure
 * re-checks role and ownership.
 */
export function UserSwitcher() {
  const utils = trpc.useUtils();
  const me = trpc.auth.me.useQuery();
  const users = trpc.auth.users.useQuery();
  const switchUser = trpc.auth.switchUser.useMutation({
    onSuccess: () => utils.invalidate(),
  });

  return (
    <div className="flex items-center gap-2 text-sm">
      <label htmlFor="user-switcher" className="text-muted-foreground">
        Signed in as
      </label>
      <select
        id="user-switcher"
        className="rounded-md border px-2 py-1"
        value={me.data?.id ?? ""}
        disabled={switchUser.isPending || users.isLoading}
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
    </div>
  );
}
