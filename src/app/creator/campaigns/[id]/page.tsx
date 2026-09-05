"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

import { RoleGate } from "@/components/role-gate";
import { ErrorState, LoadingRows } from "@/components/states";
import { CampaignStatusBadge } from "@/components/status-badge";
import { SubmitClipForm } from "@/components/submit-clip-form";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { formatDate } from "@/lib/format";
import { formatCents } from "@/shared/payout";
import { PLATFORM_LABELS, type Platform } from "@/shared/platform";
import { trpc } from "@/trpc/client";

export default function CreatorCampaignPage() {
  const params = useParams<{ id: string }>();
  return (
    <RoleGate role="creator">
      <CampaignDetail id={params.id} />
    </RoleGate>
  );
}

function CampaignDetail({ id }: { id: string }) {
  const campaign = trpc.campaign.byId.useQuery({ id });

  if (campaign.isPending) return <LoadingRows rows={4} label="Loading campaign" />;
  if (campaign.isError) {
    return (
      <ErrorState
        title="Could not load this campaign"
        error={campaign.error}
        onRetry={() => campaign.refetch()}
      />
    );
  }

  const platforms = campaign.data.platforms as Platform[];

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <Link
          href="/creator/campaigns"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          ← Active campaigns
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold">{campaign.data.title}</h1>
          <CampaignStatusBadge status={campaign.data.status} />
        </div>
        <p className="text-sm text-muted-foreground">
          {platforms.map((p) => PLATFORM_LABELS[p]).join(", ")} ·{" "}
          {formatCents(campaign.data.payoutPer1kViews)} per 1,000 views ·{" "}
          {formatDate(campaign.data.startsAt)} – {formatDate(campaign.data.endsAt)}
        </p>
      </header>

      <section aria-labelledby="submit-heading" className="space-y-4">
        <h2 id="submit-heading" className="text-lg font-semibold">
          Submit a clip
        </h2>

        {campaign.data.status === "active" ? (
          <SubmitClipForm campaignId={campaign.data.id} platforms={platforms} />
        ) : (
          <Alert>
            <AlertTitle>This campaign is not accepting clips</AlertTitle>
            <AlertDescription>
              It is {campaign.data.status}. Only active campaigns take new submissions.
            </AlertDescription>
          </Alert>
        )}
      </section>
    </div>
  );
}
