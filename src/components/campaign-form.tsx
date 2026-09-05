"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCents } from "@/shared/payout";
import { PLATFORM_LABELS, PLATFORMS } from "@/shared/platform";
import {
  CAMPAIGN_STATUSES,
  campaignFormSchema,
  type CampaignFormInput,
  type CampaignFormValues,
} from "@/shared/schemas/campaign";
import type { AppErrorPayload } from "@/shared/errors";

/**
 * One form for create and edit.
 *
 * The resolver is `campaignFormSchema` from `@/shared/schemas/campaign` — the
 * same module, and the same field rules, the tRPC procedure validates with.
 * Money is entered in cents on purpose (NOTES.md): parsing a dollars-and-cents
 * text field is the one place a float could get into a payout.
 */
export function CampaignForm({
  defaultValues,
  submitLabel,
  pending,
  appError,
  onSubmit,
}: {
  defaultValues: CampaignFormInput;
  submitLabel: string;
  pending: boolean;
  /** Typed server failure to surface next to the field that caused it. */
  appError: AppErrorPayload | null;
  onSubmit: (values: CampaignFormValues) => void;
}) {
  const form = useForm<CampaignFormInput, undefined, CampaignFormValues>({
    resolver: zodResolver(campaignFormSchema),
    defaultValues,
    mode: "onBlur",
  });

  const budgetBelowCommitted =
    appError?.code === "BUDGET_BELOW_COMMITTED" ? appError : null;
  const otherError = appError && !budgetBelowCommitted ? appError : null;

  return (
    <Form {...form}>
      <form
        noValidate
        className="max-w-xl space-y-6"
        onSubmit={form.handleSubmit(onSubmit)}
      >
        {otherError ? (
          <Alert variant="destructive">
            <AlertTitle>Could not save this campaign</AlertTitle>
            <AlertDescription>{describe(otherError)}</AlertDescription>
          </Alert>
        ) : null}

        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Title</FormLabel>
              <FormControl>
                <Input {...field} autoComplete="off" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="platforms"
          render={({ field }) => (
            <FormItem>
              <fieldset aria-describedby="platforms-description">
                <legend className="text-sm leading-none font-medium">Platforms</legend>
                <p
                  id="platforms-description"
                  className="mt-1 text-sm text-muted-foreground"
                >
                  Clips are only accepted from the platforms you pick here.
                </p>
                <div className="mt-3 flex flex-wrap gap-4">
                  {PLATFORMS.map((platform) => {
                    const checked = field.value.includes(platform);
                    return (
                      <div key={platform} className="flex items-center gap-2">
                        <Checkbox
                          id={`platform-${platform}`}
                          checked={checked}
                          onCheckedChange={(next) => {
                            field.onChange(
                              next === true
                                ? [...field.value, platform]
                                : field.value.filter((p) => p !== platform),
                            );
                          }}
                          onBlur={field.onBlur}
                        />
                        <Label htmlFor={`platform-${platform}`} className="font-normal">
                          {PLATFORM_LABELS[platform]}
                        </Label>
                      </div>
                    );
                  })}
                </div>
              </fieldset>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid gap-6 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="payoutPer1kViews"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Payout per 1,000 views (cents)</FormLabel>
                <FormControl>
                  <Input {...field} inputMode="numeric" className="tabular-nums" />
                </FormControl>
                <FormDescription>{preview(field.value)}</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="totalBudget"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Total budget (cents)</FormLabel>
                <FormControl>
                  <Input {...field} inputMode="numeric" className="tabular-nums" />
                </FormControl>
                <FormDescription>{preview(field.value)}</FormDescription>
                <FormMessage />
                {budgetBelowCommitted ? (
                  <Alert variant="destructive">
                    <AlertTitle>Budget is below what is already committed</AlertTitle>
                    <AlertDescription>
                      {formatCents(budgetBelowCommitted.committedCents)} is already
                      committed to approved submissions on this campaign, so the budget
                      cannot be set to{" "}
                      {formatCents(budgetBelowCommitted.attemptedBudgetCents)}. Raise it
                      to at least {formatCents(budgetBelowCommitted.committedCents)}.
                    </AlertDescription>
                  </Alert>
                ) : null}
              </FormItem>
            )}
          />
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="startsAt"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Starts on</FormLabel>
                <FormControl>
                  <Input {...field} type="date" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="endsAt"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Ends on</FormLabel>
                <FormControl>
                  <Input {...field} type="date" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="status"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Status</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger className="w-56">
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {CAMPAIGN_STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                      {status[0].toUpperCase() + status.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormDescription>
                Only <strong>active</strong> campaigns accept new clips.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : submitLabel}
        </Button>
      </form>
    </Form>
  );
}

/** Shows what the entered cents actually mean, without ever parsing a float. */
function preview(value: string): string {
  return /^\d+$/.test(value.trim())
    ? `= ${formatCents(Number(value.trim()))}`
    : "Whole cents, e.g. 250 for $2.50";
}

function describe(error: AppErrorPayload): string {
  switch (error.code) {
    case "BUDGET_BELOW_COMMITTED":
      return `Already committed: ${formatCents(error.committedCents)}.`;
    default:
      return "The server refused the change. Reload the campaign and try again.";
  }
}
