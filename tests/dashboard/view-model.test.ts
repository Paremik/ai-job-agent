import { describe, expect, it } from "vitest";
import { buildDashboardData } from "../../src/dashboard/view-model.js";

const row = {
  id: "job-1",
  title: "Junior React Developer",
  company: "Example",
  canonicalUrl: "https://example.com/jobs/1",
  location: "Opole",
  workplaceType: "remote",
  locationDecision: { status: "needs_review", explanation: "Verify remote eligibility" },
  comparison: {
    matchedSkills: ["React"],
    skillsWithoutEvidence: ["Vue"],
    statements: [
      { ignored: false, requirement: { importance: "required", evidence: { text: "React" } } },
      { ignored: true, requirement: { importance: "required", evidence: { text: "do not show" } } },
    ],
  },
  priority: { tier: "review", reasons: ["Review conditions"] },
  screening: { status: "clarify_first", reasons: ["Confirm language"], applicationAllowed: false },
};

describe("local dashboard data", () => {
  it("exports only selected job fields and retains review warnings", () => {
    const data = buildDashboardData(
      {
        generatedAt: "2026-10-01T00:00:00Z",
        profileHash: "private",
        rows: [{ ...row, description: "private text" }],
      },
      [
        {
          key: "one",
          company: "Example",
          role: "Junior",
          url: row.canonicalUrl,
          status: "draft_for_review",
          cvFile: "cv.pdf",
          attachments: ["cv.pdf"],
        },
      ],
    );
    expect(data.counts).toEqual({ all: 1, review_now: 0, clarify_first: 1, defer: 0 });
    expect(data.rows[0]?.requirements).toEqual([{ importance: "required", text: "React" }]);
    expect(data.rows[0]?.site).toBe("example.com");
    expect(data.rows[0]?.reasons).toEqual(["Confirm language"]);
    expect(JSON.stringify(data)).not.toContain("profileHash");
    expect(JSON.stringify(data)).not.toContain("private text");
  });

  it("labels known vacancy sites from their public URLs", () => {
    const data = buildDashboardData(
      {
        generatedAt: "2026-10-01T00:00:00Z",
        rows: [{ ...row, canonicalUrl: "https://pl.jooble.org/desc/123" }],
      },
      [],
    );
    expect(data.rows[0]?.site).toBe("Jooble");
  });

  it("refuses approval-enabled rows and unsafe URLs or file paths", () => {
    const report = { generatedAt: "2026-10-01T00:00:00Z", rows: [row] };
    expect(() =>
      buildDashboardData(
        {
          ...report,
          rows: [{ ...row, screening: { ...row.screening, applicationAllowed: true } }],
        },
        [],
      ),
    ).toThrow();
    expect(() =>
      buildDashboardData(
        { ...report, rows: [{ ...row, canonicalUrl: "javascript:alert(1)" }] },
        [],
      ),
    ).toThrow();
    expect(() =>
      buildDashboardData(report, [
        {
          key: "one",
          company: "Example",
          role: "Junior",
          url: row.canonicalUrl,
          status: "draft_for_review",
          cvFile: "../private.pdf",
        },
      ]),
    ).toThrow();
  });
});
