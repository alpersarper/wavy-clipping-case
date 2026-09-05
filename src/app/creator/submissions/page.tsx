"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { Pagination } from "@/components/pagination";
import { RoleGate } from "@/components/role-gate";
import { EmptyState, ErrorState, LoadingRows } from "@/components/states";
import { SubmissionStatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatViews } from "@/lib/format";
import { formatCents } from "@/shared/payout";
import { PLATFORM_LABELS } from "@/shared/platform";
import { SUBMISSION_STATUSES, type SubmissionStatus } from "@/shared/schemas/submission";
import { trpc } from "@/trpc/client";

const PAGE_SIZE = 10;
const ANY_STATUS = "all";

export default function MySubmissionsPage() {
  return (
    <RoleGate role="creator">
      <MySubmissions />
    </RoleGate>
  );
}

function MySubmissions() {
  const [status, setStatus] = useState<SubmissionStatus | typeof ANY_STATUS>(ANY_STATUS);
  const [page, setPage] = useState(1);

  const input = useMemo(
    () => ({
      page,
      pageSize: PAGE_SIZE,
      status: status === ANY_STATUS ? undefined : status,
    }),
    [page, status],
  );

  const submissions = trpc.submission.mine.useQuery(input, {
    placeholderData: (prev) => prev,
  });

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">My submissions</h1>
          <p className="text-sm text-muted-foreground">
            Earnings are an estimate while a clip is pending, and the committed amount
            once it is approved.
          </p>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="submission-status">Status</Label>
          <Select
            value={status}
            onValueChange={(value) => {
              setStatus(value as SubmissionStatus | typeof ANY_STATUS);
              setPage(1);
            }}
          >
            <SelectTrigger id="submission-status" className="w-40">
              <SelectValue placeholder="Any status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY_STATUS}>Any status</SelectItem>
              {SUBMISSION_STATUSES.map((value) => (
                <SelectItem key={value} value={value}>
                  {value[0].toUpperCase() + value.slice(1)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {submissions.isPending ? (
        <LoadingRows rows={5} label="Loading your submissions" />
      ) : submissions.isError ? (
        <ErrorState
          title="Could not load your submissions"
          error={submissions.error}
          onRetry={() => submissions.refetch()}
        />
      ) : submissions.data.items.length === 0 ? (
        <EmptyState
          title={
            status === ANY_STATUS
              ? "You have not submitted any clips yet"
              : `No ${status} submissions`
          }
          description={
            status === ANY_STATUS
              ? "Pick an active campaign and submit your first clip."
              : "Try a different status filter."
          }
        >
          {status === ANY_STATUS ? (
            <Button asChild>
              <Link href="/creator/campaigns">Browse campaigns</Link>
            </Button>
          ) : (
            <Button type="button" variant="outline" onClick={() => setStatus(ANY_STATUS)}>
              Clear filter
            </Button>
          )}
        </EmptyState>
      ) : (
        <>
          <div className="overflow-x-auto">
            <Table>
              <caption className="sr-only">
                Your submissions, page {submissions.data.page} of{" "}
                {submissions.data.pageCount}
              </caption>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Campaign</TableHead>
                  <TableHead scope="col">Clip</TableHead>
                  <TableHead scope="col">Status</TableHead>
                  <TableHead scope="col" className="text-right">
                    Views
                  </TableHead>
                  <TableHead scope="col" className="text-right">
                    Earnings
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {submissions.data.items.map((item) => (
                  <TableRow key={item.id} data-testid="submission-row">
                    <TableCell className="font-medium">{item.campaignTitle}</TableCell>
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
                    <TableCell>
                      <SubmissionStatusBadge status={item.status} />
                      {item.rejectionReason ? (
                        <p className="mt-1 max-w-56 text-xs text-muted-foreground">
                          {item.rejectionReason}
                        </p>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatViews(item.currentViews)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {item.approvedPayoutCents === null ? (
                        <>
                          {formatCents(item.estimatedEarningsCents)}
                          <span className="block text-xs font-normal text-muted-foreground">
                            estimated
                          </span>
                        </>
                      ) : (
                        <>
                          {formatCents(item.approvedPayoutCents)}
                          <span className="block text-xs font-normal text-muted-foreground">
                            approved
                          </span>
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <Pagination
            page={submissions.data.page}
            pageCount={submissions.data.pageCount}
            total={submissions.data.total}
            noun="submission"
            onChange={setPage}
            busy={submissions.isFetching}
          />
        </>
      )}
    </section>
  );
}
