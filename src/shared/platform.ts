/**
 * Platforms a campaign can run on, and what a real post URL looks like on each.
 *
 * This lives in `shared/` because both the submission form (react-hook-form)
 * and the tRPC procedure validate against exactly the same rules.
 */
export const PLATFORMS = ["tiktok", "instagram", "youtube"] as const;

export type Platform = (typeof PLATFORMS)[number];

export const PLATFORM_LABELS: Record<Platform, string> = {
  tiktok: "TikTok",
  instagram: "Instagram",
  youtube: "YouTube",
};

/**
 * Deliberately narrow: we want "looks like a real post URL", not "is a URL on
 * that domain". A profile link or a bare domain must not pass.
 */
const PLATFORM_URL_PATTERNS: Record<Platform, RegExp> = {
  tiktok: /^https:\/\/(?:www\.)?tiktok\.com\/@[\w.-]{1,64}\/video\/\d{6,32}\/?(?:\?.*)?$/i,
  instagram: /^https:\/\/(?:www\.)?instagram\.com\/(?:p|reel|reels|tv)\/[A-Za-z0-9_-]{5,32}\/?(?:\?.*)?$/i,
  youtube:
    /^https:\/\/(?:(?:www\.|m\.)?youtube\.com\/(?:watch\?(?:[^#]*&)?v=[A-Za-z0-9_-]{11}(?:&[^#]*)?|shorts\/[A-Za-z0-9_-]{11}\/?(?:\?.*)?)|youtu\.be\/[A-Za-z0-9_-]{11}\/?(?:\?.*)?)$/i,
};

/** Returns the platform a post URL belongs to, or `null` if it matches none. */
export function detectPlatform(url: string): Platform | null {
  const trimmed = url.trim();
  return PLATFORMS.find((p) => PLATFORM_URL_PATTERNS[p].test(trimmed)) ?? null;
}

/**
 * Canonical form used for the "same URL twice on one campaign" check.
 *
 * Without this, `?utm_source=x` or a trailing slash would be enough to submit
 * the same clip twice, so normalisation happens before the unique index sees it.
 *
 * Only the hostname and the TikTok `@handle` segment are case-folded. YouTube
 * video ids and Instagram shortcodes are case-sensitive, so folding the rest of
 * the path or the `v` param would collapse genuinely different posts.
 */
export function normalizePostUrl(url: string): string {
  const trimmed = url.trim();
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return trimmed;
  }
  parsed.hash = "";
  parsed.search = parsed.searchParams.has("v")
    ? `?v=${parsed.searchParams.get("v")}`
    : "";
  parsed.hostname = parsed.hostname.replace(/^(?:www|m)\./i, "").toLowerCase();
  parsed.protocol = "https:";
  const path = parsed.pathname
    .replace(/\/+$/, "")
    .replace(/^\/@[^/]+/, (handle) => handle.toLowerCase());
  return `${parsed.protocol}//${parsed.hostname}${path}${parsed.search}`;
}
