"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { Pagination } from "@/components/pagination";
import { RoleGate } from "@/components/role-gate";
import { EmptyState, ErrorState, LoadingRows } from "@/components/states";
import { CampaignStatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { formatDate } from "@/lib/format";
import { formatCents } from "@/shared/payout";
import { PLATFORM_LABELS, type Platform } from "@/shared/platform";
import { CAMPAIGN_STATUSES, type CampaignStatus } from "@/shared/schemas/campaign";
import { trpc } from "@/trpc/client";

const PAGE_SIZE = 10;
const ANY_STATUS = "all";

export default function AdminCampaignsPage() {
  return (
    <RoleGate role="admin">
      <CampaignList />
    </RoleGate>
  );
}

function CampaignList() {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<CampaignStatus | typeof ANY_STATUS>(ANY_STATUS);
  const [page, setPage] = useState(1);

  // Debounced so typing a title does not fire a query per keystroke. Paging is
  // reset whenever the filters change, or page 3 of an old result set leaks in.
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const input = useMemo(
    () => ({
      page,
      pageSize: PAGE_SIZE,
      search: search === "" ? undefined : search,
      status: status === ANY_STATUS ? undefined : status,
    }),
    [page, search, status],
  );

  const campaigns = trpc.campaign.list.useQuery(input, { placeholderData: (prev) => prev });

  const filtered = search !== "" || status !== ANY_STATUS;

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Campaigns</h1>
        <Button asChild>
          <Link href="/admin/campaigns/new">New campaign</Link>
        </Button>
      </div>

      <form
        role="search"
        aria-label="Filter campaigns"
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event) => event.preventDefault()}
      >
        <div className="grid min-w-56 flex-1 gap-2">
          <Label htmlFor="campaign-search">Search by title</Label>
          <Input
            id="campaign-search"
            type="search"
            placeholder="e.g. Sneaker"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="campaign-status">Status</Label>
          <Select
            value={status}
            onValueChange={(value) => {
              setStatus(value as CampaignStatus | typeof ANY_STATUS);
              setPage(1);
            }}
          >
            <SelectTrigger id="campaign-status" className="w-40">
              <SelectValue placeholder="Any status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY_STATUS}>Any status</SelectItem>
              {CAMPAIGN_STATUSES.map((value) => (
                <SelectItem key={value} value={value}>
                  {value[0].toUpperCase() + value.slice(1)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </form>

      {campaigns.isPending ? (
        <LoadingRows rows={5} label="Loading campaigns" />
      ) : campaigns.isError ? (
        <ErrorState
          title="Could not load campaigns"
          error={campaigns.error}
          onRetry={() => campaigns.refetch()}
        />
      ) : campaigns.data.items.length === 0 ? (
        <EmptyState
          title={filtered ? "No campaigns match those filters" : "No campaigns yet"}
          description={
            filtered
              ? "Clear the search box or pick a different status."
              : "Create the first campaign to start collecting clips."
          }
        >
          {filtered ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setSearchInput("");
                setStatus(ANY_STATUS);
                setPage(1);
              }}
            >
              Clear filters
            </Button>
          ) : (
            <Button asChild>
              <Link href="/admin/campaigns/new">New campaign</Link>
            </Button>
          )}
        </EmptyState>
      ) : (
        <>
          <div className="overflow-x-auto">
            <Table>
              <caption className="sr-only">
                Campaigns, page {campaigns.data.page} of {campaigns.data.pageCount}
              </caption>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Title</TableHead>
                  <TableHead scope="col">Status</TableHead>
                  <TableHead scope="col">Platforms</TableHead>
                  <TableHead scope="col" className="text-right">
                    Per 1k views
                  </TableHead>
                  <TableHead scope="col" className="text-right">
                    Budget
                  </TableHead>
                  <TableHead scope="col">Period</TableHead>
                  <TableHead scope="col">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {campaigns.data.items.map((campaign) => (
                  <TableRow key={campaign.id}>
                    <TableCell className="font-medium">
                      <Link
                        href={`/admin/campaigns/${campaign.id}`}
                        className="underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                      >
                        {campaign.title}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <CampaignStatusBadge status={campaign.status} />
                    </TableCell>
                    <TableCell>
                      {(campaign.platforms as Platform[])
                        .map((p) => PLATFORM_LABELS[p])
                        .join(", ")}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCents(campaign.payoutPer1kViews)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCents(campaign.totalBudget)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {formatDate(campaign.startsAt)} – {formatDate(campaign.endsAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button asChild variant="ghost" size="sm">
                        <Link href={`/admin/campaigns/${campaign.id}/edit`}>
                          Edit<span className="sr-only"> {campaign.title}</span>
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <Pagination
            page={campaigns.data.page}
            pageCount={campaigns.data.pageCount}
            total={campaigns.data.total}
            noun="campaign"
            onChange={setPage}
            busy={campaigns.isFetching}
          />
        </>
      )}
    </section>
  );
}
