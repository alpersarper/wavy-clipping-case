"use client";

import { formatCents } from "@/shared/payout";
import { trpc } from "@/trpc/client";

/**
 * Minimal functional shell: proves the session, the role split and the
 * campaign queries end to end. The admin and creator screens land in the next
 * pass.
 */
export default function Home() {
  const me = trpc.auth.me.useQuery();

  if (me.isLoading) return <p>Loading…</p>;
  if (!me.data) {
    return (
      <p className="text-muted-foreground">
        Pick a user in the switcher above to get a session.
      </p>
    );
  }

  return me.data.role === "admin" ? <AdminCampaigns /> : <CreatorCampaigns />;
}

function AdminCampaigns() {
  const campaigns = trpc.campaign.list.useQuery({ page: 1, pageSize: 10 });

  return (
    <section className="space-y-4">
      <h1 className="text-xl font-semibold">Campaigns</h1>
      {campaigns.data ? (
        <ul className="space-y-1">
          {campaigns.data.items.map((campaign) => (
            <li key={campaign.id} className="flex justify-between gap-4 border-b py-2">
              <span>{campaign.title}</span>
              <span className="text-muted-foreground">
                {campaign.status} · {formatCents(campaign.totalBudget)} budget
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p>Loading…</p>
      )}
    </section>
  );
}

function CreatorCampaigns() {
  const campaigns = trpc.campaign.activeList.useQuery();
  const mine = trpc.submission.mine.useQuery({ page: 1, pageSize: 10 });

  return (
    <section className="space-y-8">
      <div className="space-y-4">
        <h1 className="text-xl font-semibold">Active campaigns</h1>
        <ul className="space-y-1">
          {campaigns.data?.map((campaign) => (
            <li key={campaign.id} className="flex justify-between gap-4 border-b py-2">
              <span>{campaign.title}</span>
              <span className="text-muted-foreground">
                {formatCents(campaign.payoutPer1kViews)} / 1k views
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="space-y-4">
        <h2 className="text-lg font-semibold">My submissions</h2>
        <ul className="space-y-1">
          {mine.data?.items.map((submission) => (
            <li key={submission.id} className="flex justify-between gap-4 border-b py-2">
              <span className="truncate">{submission.campaignTitle}</span>
              <span className="text-muted-foreground">
                {submission.status} · {submission.currentViews.toLocaleString()} views ·{" "}
                {formatCents(submission.approvedPayoutCents ?? submission.estimatedEarningsCents)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
