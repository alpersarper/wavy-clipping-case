"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

import { DailyViewsChart } from "@/components/daily-views-chart";
import { ReviewQueue } from "@/components/review-queue";
import { RoleGate } from "@/components/role-gate";
import { ErrorState, LoadingBlock, LoadingRows } from "@/components/states";
import { CampaignStatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate, formatViews } from "@/lib/format";
import { formatCents } from "@/shared/payout";
import { PLATFORM_LABELS, type Platform } from "@/shared/platform";
import { trpc } from "@/trpc/client";

export default function AdminCampaignPage() {
  const params = useParams<{ id: string }>();
  return (
    <RoleGate role="admin">
      <CampaignDetail id={params.id} />
    </RoleGate>
  );
}

function CampaignDetail({ id }: { id: string }) {
  const overview = trpc.campaign.overview.useQuery({ id });

  if (overview.isPending) {
    return (
      <div className="space-y-6">
        <LoadingRows rows={2} label="Loading campaign" />
        <LoadingBlock label="Loading the overview" className="h-64 w-full" />
      </div>
    );
  }

  if (overview.isError) {
    return (
      <ErrorState
        title="Could not load this campaign"
        error={overview.error}
        onRetry={() => overview.refetch()}
      />
    );
  }

  const { campaign, ...stats } = overview.data;

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <Link
          href="/admin/campaigns"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          ← Campaigns
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-xl font-semibold">{campaign.title}</h1>
            <CampaignStatusBadge status={campaign.status} />
          </div>
          <Button asChild variant="outline">
            <Link href={`/admin/campaigns/${campaign.id}/edit`}>Edit campaign</Link>
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          {(campaign.platforms as Platform[]).map((p) => PLATFORM_LABELS[p]).join(", ")} ·{" "}
          {formatCents(campaign.payoutPer1kViews)} per 1,000 views ·{" "}
          {formatDate(campaign.startsAt)} – {formatDate(campaign.endsAt)}
        </p>
      </header>

      <section aria-labelledby="overview-heading" className="space-y-4">
        <h2 id="overview-heading" className="text-lg font-semibold">
          Overview
        </h2>

        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            label="Approved views"
            value={formatViews(stats.totalApprovedViews)}
            hint={`${stats.approvedSubmissionCount} approved ${
              stats.approvedSubmissionCount === 1 ? "clip" : "clips"
            }`}
          />
          <Stat label="Budget spent" value={formatCents(stats.budgetSpentCents)} />
          <Stat label="Budget left" value={formatCents(stats.budgetLeftCents)} />
          <Stat label="Total budget" value={formatCents(campaign.totalBudget)} />
        </dl>

        <Card>
          <CardHeader>
            <CardTitle>Daily views</CardTitle>
          </CardHeader>
          <CardContent>
            <DailyViewsChart data={stats.dailyViews} />
          </CardContent>
        </Card>
      </section>

      <ReviewQueue campaignId={campaign.id} />
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border px-4 py-3">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-lg font-semibold tabular-nums">{value}</dd>
      {hint ? <dd className="text-xs text-muted-foreground">{hint}</dd> : null}
    </div>
  );
}
