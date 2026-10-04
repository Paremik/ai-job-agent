import { describe, expect, it } from "vitest";
import { SourceChecksSchema, verifiedSourceCheck } from "../../src/matching/source-checks.js";

describe("reviewed source checks", () => {
  it("uses a verified entry level only while the source job hash still matches", () => {
    const id = "21916f05-64e2-4a0c-b2b5-c7e01880c801";
    const checks = SourceChecksSchema.parse([
      {
        jobId: id,
        contentHash: "original",
        sourceUrl: "https://example.com/careers/qa",
        checkedAt: "2026-10-03T12:00:00Z",
        entryLevelListed: true,
      },
    ]);
    expect(verifiedSourceCheck({ id, contentHash: "original" }, checks)?.entryLevelListed).toBe(
      true,
    );
    expect(verifiedSourceCheck({ id, contentHash: "changed" }, checks)).toBeNull();
    expect(verifiedSourceCheck({ id: "other", contentHash: "original" }, checks)).toBeNull();
  });

  it("rejects unsafe source URLs", () => {
    expect(() =>
      SourceChecksSchema.parse([
        {
          jobId: "21916f05-64e2-4a0c-b2b5-c7e01880c801",
          contentHash: "original",
          sourceUrl: "http://example.com/careers/qa",
          checkedAt: "2026-10-03T12:00:00Z",
          entryLevelListed: true,
        },
      ]),
    ).toThrow();
  });
});
