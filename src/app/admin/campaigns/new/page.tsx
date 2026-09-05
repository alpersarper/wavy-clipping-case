"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { CampaignForm } from "@/components/campaign-form";
import { RoleGate } from "@/components/role-gate";
import { appErrorFrom, type AppErrorPayload } from "@/shared/errors";
import { toDayInput } from "@/lib/format";
import type { CampaignFormInput } from "@/shared/schemas/campaign";
import { trpc } from "@/trpc/client";

export default function NewCampaignPage() {
  return (
    <RoleGate role="admin">
      <NewCampaign />
    </RoleGate>
  );
}

function today(offsetDays = 0): string {
  const now = new Date();
  return toDayInput(
    new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + offsetDays),
    ),
  );
}

const DEFAULTS: CampaignFormInput = {
  title: "",
  platforms: ["tiktok"],
  payoutPer1kViews: "200",
  totalBudget: "50000",
  status: "draft",
  startsAt: today(),
  endsAt: today(30),
};

function NewCampaign() {
  const router = useRouter();
  const utils = trpc.useUtils();
  const [appError, setAppError] = useState<AppErrorPayload | null>(null);

  const create = trpc.campaign.create.useMutation({
    onSuccess: async (campaign) => {
      await utils.campaign.invalidate();
      router.push(`/admin/campaigns/${campaign.id}`);
    },
    onError: (error) => setAppError(appErrorFrom(error)),
  });

  return (
    <section className="space-y-6">
      <div className="space-y-1">
        <Link
          href="/admin/campaigns"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          ← Campaigns
        </Link>
        <h1 className="text-xl font-semibold">New campaign</h1>
      </div>

      {create.isError && !appError ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {create.error.message}
        </p>
      ) : null}

      <CampaignForm
        defaultValues={DEFAULTS}
        submitLabel="Create campaign"
        pending={create.isPending}
        appError={appError}
        onSubmit={(values) => {
          setAppError(null);
          create.mutate(values);
        }}
      />
    </section>
  );
}
