"use client";

import Link from "next/link";
import { useState } from "react";

import { Pagination } from "@/components/pagination";
import { RejectDialog } from "@/components/reject-dialog";
import { EmptyState, ErrorState, LoadingRows } from "@/components/states";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate, formatViews } from "@/lib/format";
import { appErrorFrom, type AppErrorPayload } from "@/shared/errors";
import { formatCents } from "@/shared/payout";
import { PLATFORM_LABELS } from "@/shared/platform";
import { trpc } from "@/trpc/client";

const PAGE_SIZE = 10;

type ReviewFailure = { submissionUrl: string; payload: AppErrorPayload };

/**
 * Pending submissions for one campaign, with approve and reject.
 *
 * The interesting state here is the typed failure: an approval that would break
 * the budget comes back as `BUDGET_EXCEEDED` carrying the amounts, and this
 * renders it as an alert that says what to do next rather than a generic toast.
 */
export function ReviewQueue({ campaignId }: { campaignId: string }) {
  const utils = trpc.useUtils();
  const [page, setPage] = useState(1);
  const [failure, setFailure] = useState<ReviewFailure | null>(null);
  const [rejecting, setRejecting] = useState<{ id: string; postUrl: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const queue = trpc.submission.reviewQueue.useQuery(
    { campaignId, page, pageSize: PAGE_SIZE },
    { placeholderData: (prev) => prev },
  );

  async function refresh() {
    await Promise.all([
      utils.submission.reviewQueue.invalidate({ campaignId }),
      utils.campaign.overview.invalidate({ id: campaignId }),
      utils.campaign.byId.invalidate({ id: campaignId }),
      utils.campaign.list.invalidate(),
    ]);
  }

  const approve = trpc.submission.approve.useMutation({
    onSuccess: async () => {
      setFailure(null);
      await refresh();
    },
    onError: (error, variables) => {
      const payload = appErrorFrom(error);
      const item = queue.data?.items.find((i) => i.id === variables.submissionId);
      setFailure(
        payload
          ? { submissionUrl: item?.postUrl ?? "this submission", payload }
          : null,
      );
    },
    onSettled: () => setBusyId(null),
  });

  const reject = trpc.submission.reject.useMutation({
    onSuccess: async () => {
      setFailure(null);
      setRejecting(null);
      await refresh();
    },
    onError: (error, variables) => {
      const payload = appErrorFrom(error);
      const item = queue.data?.items.find((i) => i.id === variables.submissionId);
      setFailure(
        payload
          ? { submissionUrl: item?.postUrl ?? "this submission", payload }
          : null,
      );
      setRejecting(null);
    },
    onSettled: () => setBusyId(null),
  });

  const genericError =
    (approve.isError && !appErrorFrom(approve.error)) ||
    (reject.isError && !appErrorFrom(reject.error));

  return (
    <section aria-labelledby="review-queue-heading" className="space-y-4">
      <h2 id="review-queue-heading" className="text-lg font-semibold">
        Review queue
      </h2>

      {failure ? (
        <ReviewFailureAlert
          failure={failure}
          campaignId={campaignId}
          onDismiss={() => setFailure(null)}
        />
      ) : null}

      {genericError ? (
        <Alert variant="destructive">
          <AlertTitle>That review did not go through</AlertTitle>
          <AlertDescription>
            {(approve.error ?? reject.error)?.message ?? "Unexpected error."}
          </AlertDescription>
        </Alert>
      ) : null}

      {queue.isPending ? (
        <LoadingRows rows={4} label="Loading the review queue" />
      ) : queue.isError ? (
        <ErrorState
          title="Could not load the review queue"
          error={queue.error}
          onRetry={() => queue.refetch()}
        />
      ) : queue.data.items.length === 0 ? (
        <EmptyState
          title="Nothing to review"
          description="Every submission on this campaign has been approved or rejected."
        />
      ) : (
        <>
          <div className="overflow-x-auto">
            <Table>
              <caption className="sr-only">
                Pending submissions, page {queue.data.page} of {queue.data.pageCount}
              </caption>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Clip</TableHead>
                  <TableHead scope="col">Creator</TableHead>
                  <TableHead scope="col">Submitted</TableHead>
                  <TableHead scope="col" className="text-right">
                    Views
                  </TableHead>
                  <TableHead scope="col" className="text-right">
                    Pays out
                  </TableHead>
                  <TableHead scope="col">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {queue.data.items.map((item) => (
                  <TableRow key={item.id} data-testid="review-row">
                    <TableCell className="max-w-64">
                      <a
                        href={item.postUrl}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="block truncate underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                      >
                        {item.postUrl}
                      </a>
                      <span className="text-xs text-muted-foreground">
                        {PLATFORM_LABELS[item.platform]}
                      </span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{item.creatorEmail}</TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {formatDate(item.createdAt)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatViews(item.currentViews)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCents(item.pendingPayoutCents)}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        <Button
                          type="button"
                          size="sm"
                          disabled={busyId !== null}
                          onClick={() => {
                            setBusyId(item.id);
                            approve.mutate({ submissionId: item.id });
                          }}
                        >
                          {busyId === item.id && approve.isPending
                            ? "Approving…"
                            : "Approve"}
                          <span className="sr-only"> {item.postUrl}</span>
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="destructive"
                          disabled={busyId !== null}
                          onClick={() =>
                            setRejecting({ id: item.id, postUrl: item.postUrl })
                          }
                        >
                          Reject<span className="sr-only"> {item.postUrl}</span>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <Pagination
            page={queue.data.page}
            pageCount={queue.data.pageCount}
            total={queue.data.total}
            noun="pending submission"
            onChange={setPage}
            busy={queue.isFetching}
          />
        </>
      )}

      <RejectDialog
        open={rejecting !== null}
        onOpenChange={(open) => {
          if (!open) setRejecting(null);
        }}
        submissionLabel={rejecting?.postUrl ?? ""}
        pending={reject.isPending}
        onConfirm={(reason) => {
          if (!rejecting) return;
          setBusyId(rejecting.id);
          reject.mutate({ submissionId: rejecting.id, reason });
        }}
      />
    </section>
  );
}

/** The typed failures a reviewer can actually act on. */
function ReviewFailureAlert({
  failure,
  campaignId,
  onDismiss,
}: {
  failure: ReviewFailure;
  campaignId: string;
  onDismiss: () => void;
}) {
  const { payload } = failure;

  if (payload.code === "BUDGET_EXCEEDED") {
    return (
      <Alert variant="destructive" data-testid="budget-exceeded-alert">
        <AlertTitle>Not enough budget to approve this clip</AlertTitle>
        <AlertDescription>
          <p>
            Approving <span className="break-all">{failure.submissionUrl}</span> would
            commit {formatCents(payload.requiredCents)}, but only{" "}
            {formatCents(payload.remainingCents)} of the{" "}
            {formatCents(payload.totalBudgetCents)} budget is left. Nothing was changed.
          </p>
          <p>
            Reject the clip, or raise the budget on this campaign and approve it again.
          </p>
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href={`/admin/campaigns/${campaignId}/edit`}>Edit budget</Link>
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={onDismiss}>
              Dismiss
            </Button>
          </div>
        </AlertDescription>
      </Alert>
    );
  }

  const { title, body } =
    payload.code === "SUBMISSION_ALREADY_REVIEWED"
      ? {
          title: "Someone reviewed this one first",
          body: `It is already ${payload.status}. Refresh the queue to see the current list.`,
        }
      : payload.code === "CAMPAIGN_NOT_ACCEPTING_REVIEW"
        ? {
            title: "This campaign is closed for review",
            body: `The campaign is ${payload.status}, so approvals are not accepted. Reopen it from the edit screen if that is wrong.`,
          }
        : { title: "That review did not go through", body: "Nothing was changed." };

  return (
    <Alert variant="destructive">
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>
        <p>{body}</p>
        <Button type="button" variant="ghost" size="sm" onClick={onDismiss}>
          Dismiss
        </Button>
      </AlertDescription>
    </Alert>
  );
}
