import { describe, expect, it } from "vitest";
import { buildDashboardData } from "../../src/dashboard/view-model.js";

const row = {
  id: "job-1",
  title: "Junior React Developer",
  company: "Example",
  canonicalUrl: "https://example.com/jobs/1",
  location: "Opole",
  workplaceType: "remote",
  lastSeenAt: "2026-10-02T10:00:00Z",
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
        discovery: {
          status: "partial",
          finishedAt: "2026-10-01T00:00:00Z",
          fetched: 10,
          valid: 8,
          rejected: 2,
        },
        profileHash: "private",
        rows: [{ ...row, description: "private text" }],
      },
      [
        {
          folder: "2026-10-01",
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
    expect(data.rows[0]?.firstLook).toBe(false);
    expect(data.rows[0]?.lastSeenAt).toBe(row.lastSeenAt);
    expect(data.discovery?.status).toBe("partial");
    expect(data.drafts[0]?.cv).toBe("applications/2026-10-01/cv.pdf");
    expect(data.drafts[0]?.title).toBe("Junior");
    expect(JSON.stringify(data)).not.toContain("profileHash");
    expect(JSON.stringify(data)).not.toContain("private text");
  });

  it("selects documented junior roles needing clarification for a first look", () => {
    const data = buildDashboardData(
      {
        generatedAt: "2026-10-01T00:00:00Z",
        rows: [
          {
            ...row,
            priority: {
              ...row.priority,
              titleLevel: "entry",
              signals: { targetRole: "development" },
            },
          },
        ],
      },
      [],
    );
    expect(data.rows[0]?.firstLook).toBe(true);
    const german = buildDashboardData(
      {
        generatedAt: "2026-10-01T00:00:00Z",
        rows: [
          {
            ...row,
            title: "Junior Frontend Developer with German",
            priority: {
              ...row.priority,
              titleLevel: "entry",
              signals: { targetRole: "development" },
            },
          },
        ],
      },
      [],
    );
    expect(german.rows[0]?.firstLook).toBe(false);
  });

  it("includes exact Opole junior IT administration despite an incomplete skill snippet", () => {
    const local = {
      ...row,
      title: "Junior Linux Administrator",
      workplaceType: "onsite",
      comparison: { ...row.comparison, matchedSkills: [] },
      priority: {
        ...row.priority,
        titleLevel: "entry",
        signals: { targetRole: "support", languageGap: false },
      },
    };
    const report = (candidate: typeof local) =>
      buildDashboardData({ generatedAt: "2026-10-01T00:00:00Z", rows: [candidate] }, []);
    expect(report(local).rows[0]?.firstLook).toBe(true);
    expect(report({ ...local, location: "Warszawa" }).rows[0]?.firstLook).toBe(false);
    expect(report({ ...local, title: "Junior / Mid Linux Administrator" }).rows[0]?.firstLook).toBe(
      false,
    );
    expect(
      report({ ...local, title: "Junior Linux Administrator with German" }).rows[0]?.firstLook,
    ).toBe(false);
    expect(
      report({ ...local, locationDecision: { status: "ineligible", explanation: "Too far" } })
        .rows[0]?.firstLook,
    ).toBe(false);
    expect(report(local).rows[0]?.status).toBe("clarify_first");
  });

  it("includes a local QA role when a current source check lists junior", () => {
    const candidate = {
      ...row,
      title: "Tester / Testerka aplikacji webowej",
      comparison: { ...row.comparison, matchedSkills: [] },
      priority: { ...row.priority, titleLevel: "unknown", signals: { targetRole: "testing" } },
      sourceCheck: {
        sourceUrl: "https://example.com/careers/qa",
        checkedAt: "2026-10-03T12:00:00Z",
        entryLevelListed: true,
      },
    };
    const result = buildDashboardData(
      { generatedAt: "2026-10-03T12:00:00Z", rows: [candidate] },
      [],
    );
    expect(result.rows[0]?.firstLook).toBe(true);
    expect(result.rows[0]?.status).toBe("clarify_first");
    expect(result.rows[0]?.sourceUrl).toBe(candidate.sourceCheck.sourceUrl);
    const withoutCheck = buildDashboardData(
      { generatedAt: "2026-10-03T12:00:00Z", rows: [{ ...candidate, sourceCheck: null }] },
      [],
    );
    expect(withoutCheck.rows[0]?.firstLook).toBe(false);
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

  it("flags same-role same-city records as possible duplicates without hiding distinct cities", () => {
    const data = buildDashboardData(
      {
        generatedAt: "2026-10-01T00:00:00Z",
        rows: [
          { ...row, title: "Junior Linux Administrator", company: "Wazdan Services Limited" },
          {
            ...row,
            id: "job-2",
            canonicalUrl: "https://example.com/jobs/2",
            title: "Junior Linux Administrator",
            company: "Wazdan Services Limited Sp. z o.o.",
          },
          {
            ...row,
            id: "job-3",
            canonicalUrl: "https://example.com/jobs/3",
            title: "Junior Linux Administrator",
            company: "Wazdan Services Limited",
            location: "Warszawa",
          },
        ],
      },
      [],
    );
    expect(data.rows).toHaveLength(3);
    expect(data.rows[0]?.possibleDuplicates).toEqual([
      { id: "job-2", url: "https://example.com/jobs/2", site: "example.com" },
    ]);
    expect(data.rows[1]?.possibleDuplicates).toHaveLength(1);
    expect(data.rows[2]?.possibleDuplicates).toEqual([]);
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
          folder: "2026-10-01",
          key: "one",
          company: "Example",
          role: "Junior",
          url: row.canonicalUrl,
          status: "draft_for_review",
          cvFile: "../private.pdf",
        },
      ]),
    ).toThrow();
    expect(() =>
      buildDashboardData(report, [
        {
          folder: "../secret",
          key: "one",
          company: "Example",
          role: "Junior",
          url: row.canonicalUrl,
          status: "draft_for_review",
          cvFile: "cv.pdf",
        },
      ]),
    ).toThrow();
  });
});
