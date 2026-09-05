"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatDay, formatViews } from "@/lib/format";

/**
 * New views per day across the campaign period.
 *
 * The server zero-fills the period with `generate_series`, so a day nobody
 * posted on is a real zero rather than a missing point (NOTES.md). A chart is
 * not readable by everyone, so the same numbers are also available as a table
 * underneath — that is the accessible equivalent, not decoration.
 */
export function DailyViewsChart({
  data,
}: {
  data: { day: string; views: number }[];
}) {
  const total = data.reduce((sum, point) => sum + point.views, 0);
  const peak = data.reduce(
    (best, point) => (point.views > best.views ? point : best),
    { day: "", views: 0 },
  );

  return (
    <figure className="space-y-3">
      <figcaption className="text-sm text-muted-foreground">
        New views per day across the campaign period.
        {total > 0 && peak.day !== ""
          ? ` ${formatViews(total)} views in total; busiest day ${formatDay(peak.day)} with ${formatViews(peak.views)}.`
          : " No views recorded in this period yet."}
      </figcaption>

      <div
        className="h-64 w-full"
        role="img"
        aria-label={
          total > 0
            ? `Bar chart of new views per day, ${formatViews(total)} views in total across ${data.length} days.`
            : `Bar chart of new views per day. Every day in this ${data.length}-day period is zero.`
        }
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="day"
              tickFormatter={(day: string) => day.slice(5)}
              tickLine={false}
              fontSize={12}
              minTickGap={16}
            />
            <YAxis
              allowDecimals={false}
              tickFormatter={formatViews}
              tickLine={false}
              axisLine={false}
              fontSize={12}
              width={56}
            />
            <Tooltip
              cursor={{ fill: "var(--muted)" }}
              labelFormatter={(day) => (typeof day === "string" ? formatDay(day) : day)}
              formatter={(value) => [formatViews(Number(value)), "New views"]}
            />
            <Bar dataKey="views" fill="var(--chart-3)" radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <details className="text-sm">
        <summary className="cursor-pointer text-muted-foreground underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
          View the daily numbers as a table
        </summary>
        <div className="mt-2 max-h-64 overflow-auto rounded-lg border">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">New views per day</caption>
            <thead className="sticky top-0 bg-background">
              <tr className="border-b">
                <th scope="col" className="px-3 py-2 font-medium">
                  Day
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  New views
                </th>
              </tr>
            </thead>
            <tbody>
              {data.map((point) => (
                <tr key={point.day} className="border-b last:border-0">
                  <th scope="row" className="px-3 py-1.5 font-normal">
                    {formatDay(point.day)}
                  </th>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {formatViews(point.views)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
