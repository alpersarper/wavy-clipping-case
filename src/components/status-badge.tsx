import {
  BanknoteIcon,
  CircleCheckIcon,
  CircleDotIcon,
  CirclePauseIcon,
  CircleXIcon,
  ClockIcon,
  PencilLineIcon,
} from "lucide-react";
import type { ComponentType } from "react";

import { Badge } from "@/components/ui/badge";
import type { CampaignStatus } from "@/shared/schemas/campaign";
import type { SubmissionStatus } from "@/shared/schemas/submission";

/**
 * Status is always an icon *and* a word, never a colour on its own: the badge
 * still reads correctly in greyscale or with a colour vision deficiency.
 */
type BadgeVariant = "default" | "secondary" | "destructive" | "outline";

const CAMPAIGN: Record<
  CampaignStatus,
  { label: string; variant: BadgeVariant; Icon: ComponentType<{ className?: string }> }
> = {
  draft: { label: "Draft", variant: "outline", Icon: PencilLineIcon },
  active: { label: "Active", variant: "default", Icon: CircleDotIcon },
  paused: { label: "Paused", variant: "secondary", Icon: CirclePauseIcon },
  completed: { label: "Completed", variant: "secondary", Icon: CircleCheckIcon },
};

const SUBMISSION: Record<
  SubmissionStatus,
  { label: string; variant: BadgeVariant; Icon: ComponentType<{ className?: string }> }
> = {
  pending: { label: "Pending", variant: "outline", Icon: ClockIcon },
  approved: { label: "Approved", variant: "default", Icon: CircleCheckIcon },
  rejected: { label: "Rejected", variant: "destructive", Icon: CircleXIcon },
  paid: { label: "Paid", variant: "secondary", Icon: BanknoteIcon },
};

export function CampaignStatusBadge({ status }: { status: CampaignStatus }) {
  const { label, variant, Icon } = CAMPAIGN[status];
  return (
    <Badge variant={variant}>
      <Icon aria-hidden="true" />
      {label}
    </Badge>
  );
}

export function SubmissionStatusBadge({ status }: { status: SubmissionStatus }) {
  const { label, variant, Icon } = SUBMISSION[status];
  return (
    <Badge variant={variant}>
      <Icon aria-hidden="true" />
      {label}
    </Badge>
  );
}
