"use client";

import Link from "next/link";

import { RoleGate } from "@/components/role-gate";
import { EmptyState, ErrorState, LoadingRows } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatDate } from "@/lib/format";
import { formatCents } from "@/shared/payout";
import { PLATFORM_LABELS, type Platform } from "@/shared/platform";
import { trpc } from "@/trpc/client";

export default function CreatorCampaignsPage() {
  return (
    <RoleGate role="creator">
      <ActiveCampaigns />
    </RoleGate>
  );
}

function ActiveCampaigns() {
  const campaigns = trpc.campaign.activeList.useQuery();

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Active campaigns</h1>
        <p className="text-sm text-muted-foreground">
          Campaigns taking clips right now. You are paid per 1,000 views once a clip is
          approved.
        </p>
      </div>

      {campaigns.isPending ? (
        <LoadingRows rows={4} label="Loading campaigns" />
      ) : campaigns.isError ? (
        <ErrorState
          title="Could not load campaigns"
          error={campaigns.error}
          onRetry={() => campaigns.refetch()}
        />
      ) : campaigns.data.length === 0 ? (
        <EmptyState
          title="No active campaigns"
          description="Nothing is accepting clips at the moment. Check back later."
        />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {campaigns.data.map((campaign) => (
            <li key={campaign.id}>
              <Card className="h-full">
                <CardHeader>
                  <CardTitle>
                    <Link
                      href={`/creator/campaigns/${campaign.id}`}
                      className="underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                    >
                      {campaign.title}
                    </Link>
                  </CardTitle>
                  <CardDescription>
                    {formatCents(campaign.payoutPer1kViews)} per 1,000 views ·{" "}
                    {formatDate(campaign.startsAt)} – {formatDate(campaign.endsAt)}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <ul className="flex flex-wrap gap-1.5">
                    {(campaign.platforms as Platform[]).map((platform) => (
                      <li key={platform}>
                        <Badge variant="outline">{PLATFORM_LABELS[platform]}</Badge>
                      </li>
                    ))}
                  </ul>
                  <Button asChild size="sm">
                    <Link href={`/creator/campaigns/${campaign.id}`}>
                      Submit a clip<span className="sr-only"> to {campaign.title}</span>
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
