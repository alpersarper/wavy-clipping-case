"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { trpc } from "@/trpc/client";

const ADMIN_LINKS = [{ href: "/admin/campaigns", label: "Campaigns" }];

const CREATOR_LINKS = [
  { href: "/creator/campaigns", label: "Browse campaigns" },
  { href: "/creator/submissions", label: "My submissions" },
];

/**
 * Role-aware primary navigation. The links a signed-in user cannot use are not
 * rendered; the procedures behind them enforce the same rule regardless.
 */
export function AppNav() {
  const pathname = usePathname();
  const me = trpc.auth.me.useQuery();

  const links = me.data?.role === "admin" ? ADMIN_LINKS : me.data ? CREATOR_LINKS : [];
  if (links.length === 0) return null;

  return (
    <nav aria-label="Main">
      <ul className="flex items-center gap-1">
        {links.map((link) => {
          const current = pathname === link.href || pathname.startsWith(`${link.href}/`);
          return (
            <li key={link.href}>
              <Link
                href={link.href}
                aria-current={current ? "page" : undefined}
                className="rounded-md px-2 py-1 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none aria-[current=page]:font-medium aria-[current=page]:text-foreground aria-[current=page]:underline"
              >
                {link.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
