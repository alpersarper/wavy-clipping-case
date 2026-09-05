"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
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
import { appErrorFrom, type AppErrorPayload } from "@/shared/errors";
import { PLATFORM_LABELS, type Platform } from "@/shared/platform";
import { submissionFormSchema } from "@/shared/schemas/submission";
import { trpc } from "@/trpc/client";

/**
 * Submit one clip to a campaign.
 *
 * `submissionFormSchema` is the shared rule set: the same URL pattern the
 * procedure enforces, narrowed to this campaign's platforms so the creator is
 * told "this campaign is TikTok only" before the round trip. The server checks
 * both again, and the per-campaign unique index is what actually decides a
 * duplicate — so `DUPLICATE_SUBMISSION_URL` is surfaced on the URL field.
 */
export function SubmitClipForm({
  campaignId,
  platforms,
}: {
  campaignId: string;
  platforms: Platform[];
}) {
  const utils = trpc.useUtils();
  const [blocked, setBlocked] = useState<AppErrorPayload | null>(null);
  const [submittedUrl, setSubmittedUrl] = useState<string | null>(null);

  const schema = useMemo(() => submissionFormSchema(platforms), [platforms]);

  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: { campaignId, postUrl: "" },
    mode: "onSubmit",
  });

  const create = trpc.submission.create.useMutation({
    onSuccess: async (submission) => {
      setBlocked(null);
      setSubmittedUrl(submission.postUrl);
      form.reset({ campaignId, postUrl: "" });
      await utils.submission.mine.invalidate();
    },
    onError: (error) => {
      const payload = appErrorFrom(error);
      setSubmittedUrl(null);

      if (payload?.code === "DUPLICATE_SUBMISSION_URL") {
        setBlocked(null);
        form.setError("postUrl", {
          type: "server",
          message: "That clip has already been submitted to this campaign.",
        });
        return;
      }

      if (payload?.code === "PLATFORM_NOT_ALLOWED") {
        setBlocked(null);
        form.setError("postUrl", {
          type: "server",
          message: `This campaign only accepts ${payload.allowed
            .map((p) => PLATFORM_LABELS[p as Platform] ?? p)
            .join(", ")}.`,
        });
        return;
      }

      setBlocked(payload);
    },
  });

  return (
    <Form {...form}>
      <form
        noValidate
        className="max-w-xl space-y-4"
        onSubmit={form.handleSubmit((values) => create.mutate(values))}
      >
        {submittedUrl ? (
          <Alert data-testid="submit-success">
            <AlertTitle>Clip submitted</AlertTitle>
            <AlertDescription>
              <p className="break-all">{submittedUrl} is now pending review.</p>
              <Button asChild variant="outline" size="sm">
                <Link href="/creator/submissions">See my submissions</Link>
              </Button>
            </AlertDescription>
          </Alert>
        ) : null}

        {blocked?.code === "CAMPAIGN_NOT_ACCEPTING_SUBMISSIONS" ? (
          <Alert variant="destructive">
            <AlertTitle>This campaign is not accepting clips</AlertTitle>
            <AlertDescription>
              It is {blocked.status}. Only active campaigns take new submissions.
            </AlertDescription>
          </Alert>
        ) : null}

        {create.isError && !appErrorFrom(create.error) ? (
          <Alert variant="destructive">
            <AlertTitle>Could not submit that clip</AlertTitle>
            <AlertDescription>{create.error.message}</AlertDescription>
          </Alert>
        ) : null}

        <FormField
          control={form.control}
          name="postUrl"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Post URL</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  type="url"
                  inputMode="url"
                  autoComplete="off"
                  placeholder="https://www.tiktok.com/@you/video/7301234567890123456"
                />
              </FormControl>
              <FormDescription>
                A link to the post itself on{" "}
                {platforms.map((p) => PLATFORM_LABELS[p]).join(" or ")} — not your
                profile.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" disabled={create.isPending}>
          {create.isPending ? "Submitting…" : "Submit clip"}
        </Button>
      </form>
    </Form>
  );
}
