import { describe, expect, it } from "vitest";

import { detectPlatform, normalizePostUrl } from "@/shared/platform";
import { submissionFormSchema } from "@/shared/schemas/submission";

describe("detectPlatform", () => {
  it("accepts real post URLs", () => {
    expect(detectPlatform("https://www.tiktok.com/@someone/video/7301234567890123456")).toBe("tiktok");
    expect(detectPlatform("https://www.instagram.com/reel/CxAbCdEfGh1/")).toBe("instagram");
    expect(detectPlatform("https://www.instagram.com/p/CxAbCdEfGh1")).toBe("instagram");
    expect(detectPlatform("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("youtube");
    expect(detectPlatform("https://youtu.be/dQw4w9WgXcQ")).toBe("youtube");
    expect(detectPlatform("https://www.youtube.com/shorts/aBcDeFgHiJk")).toBe("youtube");
  });

  it("rejects anything that is not a post", () => {
    expect(detectPlatform("https://www.tiktok.com/@someone")).toBeNull();
    expect(detectPlatform("https://www.instagram.com/someone/")).toBeNull();
    expect(detectPlatform("https://www.youtube.com/@channel")).toBeNull();
    expect(detectPlatform("https://example.com/tiktok.com/@a/video/123456")).toBeNull();
    expect(detectPlatform("not a url")).toBeNull();
    expect(detectPlatform("")).toBeNull();
  });
});

describe("normalizePostUrl", () => {
  it("collapses the variations that would otherwise duplicate a submission", () => {
    const canonical = normalizePostUrl("https://www.tiktok.com/@a/video/7301234567890123456");
    expect(normalizePostUrl("https://tiktok.com/@a/video/7301234567890123456/")).toBe(canonical);
    expect(
      normalizePostUrl("https://www.tiktok.com/@a/video/7301234567890123456?utm_source=x"),
    ).toBe(canonical);
    expect(normalizePostUrl("https://www.tiktok.com/@A/video/7301234567890123456#top")).toBe(
      canonical,
    );
    expect(normalizePostUrl("https://www.tiktok.com/@a/video/7301234567890123456?v=1")).toBe(
      canonical,
    );
  });

  it("keeps the YouTube video id, which is the only meaningful query param", () => {
    expect(normalizePostUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42")).toBe(
      "https://youtube.com/watch?v=dQw4w9WgXcQ",
    );
    expect(normalizePostUrl("https://www.youtube.com/watch/?v=dQw4w9WgXcQ")).toBe(
      "https://youtube.com/watch?v=dQw4w9WgXcQ",
    );
  });

  it("drops a v param on shapes where the id lives in the path", () => {
    expect(normalizePostUrl("https://www.instagram.com/reel/CxAbCdEfGh1/?v=1")).toBe(
      normalizePostUrl("https://www.instagram.com/reel/CxAbCdEfGh1/"),
    );
    expect(normalizePostUrl("https://youtu.be/dQw4w9WgXcQ?v=1")).toBe(
      normalizePostUrl("https://youtu.be/dQw4w9WgXcQ"),
    );
    expect(normalizePostUrl("https://www.youtube.com/shorts/dQw4w9WgXcQ?v=1")).toBe(
      normalizePostUrl("https://www.youtube.com/shorts/dQw4w9WgXcQ"),
    );
  });

  it("distinguishes different posts", () => {
    expect(normalizePostUrl("https://www.tiktok.com/@a/video/1111111111111111111")).not.toBe(
      normalizePostUrl("https://www.tiktok.com/@a/video/2222222222222222222"),
    );
  });

  it("keeps case-sensitive video ids apart", () => {
    // YouTube ids are case-sensitive: these are two different videos.
    expect(normalizePostUrl("https://youtu.be/AbCdEfGhIjK")).not.toBe(
      normalizePostUrl("https://youtu.be/abcdefghijk"),
    );
    expect(normalizePostUrl("https://www.youtube.com/watch?v=AbCdEfGhIjK")).not.toBe(
      normalizePostUrl("https://www.youtube.com/watch?v=abcdefghijk"),
    );
    expect(normalizePostUrl("https://www.instagram.com/reel/CxAbCdEfGh1/")).not.toBe(
      normalizePostUrl("https://www.instagram.com/reel/cxabcdefgh1/"),
    );
  });
});

describe("submissionFormSchema", () => {
  const campaignId = "11111111-1111-4111-8111-111111111111";

  it("accepts a URL on one of the campaign's platforms", () => {
    const schema = submissionFormSchema(["tiktok", "instagram"]);
    const result = schema.safeParse({
      campaignId,
      postUrl: "https://www.instagram.com/reel/CxAbCdEfGh1/",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a valid post URL on a platform the campaign does not run on", () => {
    const schema = submissionFormSchema(["tiktok"]);
    const result = schema.safeParse({
      campaignId,
      postUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    });
    expect(result.success).toBe(false);
  });
});
