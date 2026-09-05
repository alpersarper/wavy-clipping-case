"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";

import { CampaignForm } from "@/components/campaign-form";
import { RoleGate } from "@/components/role-gate";
import { ErrorState, LoadingRows } from "@/components/states";
import { toDayInput } from "@/lib/format";
import { appErrorFrom, type AppErrorPayload } from "@/shared/errors";
import type { Platform } from "@/shared/platform";
import type { CampaignFormInput } from "@/shared/schemas/campaign";
import { trpc } from "@/trpc/client";

export default function EditCampaignPage() {
  const params = useParams<{ id: string }>();
  return (
    <RoleGate role="admin">
      <EditCampaign id={params.id} />
    </RoleGate>
  );
}

function EditCampaign({ id }: { id: string }) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const [appError, setAppError] = useState<AppErrorPayload | null>(null);

  const campaign = trpc.campaign.byId.useQuery({ id });
  const update = trpc.campaign.update.useMutation({
    onSuccess: async () => {
      await utils.campaign.invalidate();
      router.push(`/admin/campaigns/${id}`);
    },
    onError: (error) => setAppError(appErrorFrom(error)),
  });

  if (campaign.isPending) return <LoadingRows rows={6} label="Loading campaign" />;
  if (campaign.isError) {
    return (
      <ErrorState
        title="Could not load this campaign"
        error={campaign.error}
        onRetry={() => campaign.refetch()}
      />
    );
  }

  const defaults: CampaignFormInput = {
    title: campaign.data.title,
    platforms: campaign.data.platforms as Platform[],
    payoutPer1kViews: String(campaign.data.payoutPer1kViews),
    totalBudget: String(campaign.data.totalBudget),
    status: campaign.data.status,
    startsAt: toDayInput(campaign.data.startsAt),
    endsAt: toDayInput(campaign.data.endsAt),
  };

  return (
    <section className="space-y-6">
      <div className="space-y-1">
        <Link
          href={`/admin/campaigns/${id}`}
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          ← {campaign.data.title}
        </Link>
        <h1 className="text-xl font-semibold">Edit campaign</h1>
      </div>

      {update.isError && !appError ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {update.error.message}
        </p>
      ) : null}

      <CampaignForm
        defaultValues={defaults}
        submitLabel="Save changes"
        pending={update.isPending}
        appError={appError}
        onSubmit={(values) => {
          setAppError(null);
          update.mutate({ id, ...values });
        }}
      />
    </section>
  );
}
