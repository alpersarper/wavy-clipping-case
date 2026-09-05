import {
  check,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

import { PLATFORMS } from "@/shared/platform";

export const userRoleEnum = pgEnum("user_role", ["admin", "creator"]);
export const platformEnum = pgEnum("platform", PLATFORMS);
export const campaignStatusEnum = pgEnum("campaign_status", [
  "draft",
  "active",
  "paused",
  "completed",
]);
export const submissionStatusEnum = pgEnum("submission_status", [
  "pending",
  "approved",
  "rejected",
  "paid",
]);

export const users = pgTable(
  "user",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    role: userRoleEnum("role").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("user_email_unique").on(t.email)],
);

export const campaigns = pgTable(
  "campaign",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    /** A campaign may run on several platforms at once. */
    platforms: platformEnum("platforms").array().notNull(),
    /** Money is integer cents everywhere. No floats touch a payout. */
    payoutPer1kViews: integer("payout_per_1k_views").notNull(),
    totalBudget: integer("total_budget").notNull(),
    status: campaignStatusEnum("status").notNull().default("draft"),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("campaign_status_idx").on(t.status),
    check("campaign_payout_non_negative", sql`${t.payoutPer1kViews} >= 0`),
    check("campaign_budget_non_negative", sql`${t.totalBudget} >= 0`),
    check("campaign_platforms_non_empty", sql`cardinality(${t.platforms}) > 0`),
    check("campaign_period_ordered", sql`${t.endsAt} >= ${t.startsAt}`),
  ],
);

export const submissions = pgTable(
  "submission",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    creatorId: uuid("creator_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    postUrl: text("post_url").notNull(),
    /** Canonical form of `post_url`; the per-campaign unique index uses this. */
    normalizedUrl: text("normalized_url").notNull(),
    platform: platformEnum("platform").notNull(),
    status: submissionStatusEnum("status").notNull().default("pending"),
    /**
     * Cents committed against the campaign budget at the moment of approval.
     * Null until approved. This is the ledger the budget is summed from --
     * see NOTES.md ("Budget bookkeeping").
     */
    approvedPayoutCents: integer("approved_payout_cents"),
    rejectionReason: text("rejection_reason"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewedBy: uuid("reviewed_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // The same clip cannot land on the same campaign twice.
    uniqueIndex("submission_campaign_url_unique").on(t.campaignId, t.normalizedUrl),
    index("submission_campaign_status_idx").on(t.campaignId, t.status),
    index("submission_creator_idx").on(t.creatorId),
    check(
      "submission_rejected_needs_reason",
      sql`(${t.status} <> 'rejected') OR (${t.rejectionReason} IS NOT NULL)`,
    ),
    check(
      "submission_payout_matches_status",
      sql`(${t.status} IN ('approved', 'paid')) = (${t.approvedPayoutCents} IS NOT NULL)`,
    ),
    check(
      "submission_payout_non_negative",
      sql`${t.approvedPayoutCents} IS NULL OR ${t.approvedPayoutCents} >= 0`,
    ),
  ],
);

export const submissionMetrics = pgTable(
  "submission_metric",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    submissionId: uuid("submission_id")
      .notNull()
      .references(() => submissions.id, { onDelete: "cascade" }),
    /** Calendar day (UTC) the snapshot belongs to. One row per day. */
    capturedAt: date("captured_at").notNull(),
    views: integer("views").notNull(),
    likes: integer("likes").notNull(),
    comments: integer("comments").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // Makes a repeated ingest run for the same day a database-level no-op.
    uniqueIndex("submission_metric_day_unique").on(t.submissionId, t.capturedAt),
    check("submission_metric_views_non_negative", sql`${t.views} >= 0`),
    check("submission_metric_likes_non_negative", sql`${t.likes} >= 0`),
    check("submission_metric_comments_non_negative", sql`${t.comments} >= 0`),
  ],
);

export const campaignRelations = relations(campaigns, ({ many }) => ({
  submissions: many(submissions),
}));

export const submissionRelations = relations(submissions, ({ one, many }) => ({
  campaign: one(campaigns, {
    fields: [submissions.campaignId],
    references: [campaigns.id],
  }),
  creator: one(users, {
    fields: [submissions.creatorId],
    references: [users.id],
  }),
  metrics: many(submissionMetrics),
}));

export const submissionMetricRelations = relations(submissionMetrics, ({ one }) => ({
  submission: one(submissions, {
    fields: [submissionMetrics.submissionId],
    references: [submissions.id],
  }),
}));

export type UserRow = typeof users.$inferSelect;
export type CampaignRow = typeof campaigns.$inferSelect;
export type SubmissionRow = typeof submissions.$inferSelect;
export type SubmissionMetricRow = typeof submissionMetrics.$inferSelect;
