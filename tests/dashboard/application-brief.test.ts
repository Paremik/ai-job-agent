import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { CandidateProfileSchema } from "../../src/domain/candidate-profile.js";
import { buildApplicationBrief } from "../../src/dashboard/application-brief.js";

const jobId = "8fdb7d46-5e42-431a-a399-ccb2c65f8f99";
const profile = CandidateProfileSchema.parse({
  version: 1,
  displayName: "Example Candidate",
  evidence: [{ id: "portfolio", kind: "github", reference: "https://github.com/example/project" }],
  facts: [
    {
      id: "react-project",
      category: "project",
      statement: "Built a React project.",
      evidenceIds: ["portfolio"],
      basis: "documented",
      skillUses: ["React"],
    },
  ],
  preferences: {
    searchScope: "entry_level_it_broad",
    homeCity: "Opole",
    homeCountry: "PL",
    onsiteInHomeCity: true,
    hybridMaxOneWayMinutes: 120,
    remoteAllowed: true,
    salary: "negotiable",
    schedule: "negotiable",
    availableFrom: null,
    workAuthorization: null,
    evidenceIds: ["portfolio"],
  },
  unresolved: ["Confirm work authorization"],
});
const profileHash = createHash("sha256").update(JSON.stringify(profile)).digest("hex");
const report = {
  generatedAt: "2026-10-02T10:00:00.000Z",
  profileHash,
  rows: [
    {
      id: jobId,
      title: "Junior React Developer",
      company: "Example",
      canonicalUrl: "https://example.com/jobs/1",
      contentHash: "job-hash",
      location: "Opole",
      workplaceType: "hybrid",
      priority: { tier: "review", reasons: ["Check schedule"] },
      screening: { status: "clarify_first", reasons: ["Confirm work mode"] },
      comparison: {
        matchedSkills: ["React"],
        skillsWithoutEvidence: ["Vue"],
        statements: [
          {
            ignored: false,
            requirement: { importance: "required", evidence: { text: "React in production" } },
            findings: [
              {
                kind: "skill",
                label: "React",
                status: "related_evidence",
                explanation: "Project use, not commercial experience.",
                factIds: ["react-project"],
                evidenceIds: ["portfolio"],
              },
            ],
          },
        ],
      },
    },
  ],
};

describe("application preparation brief", () => {
  it("includes verified facts and keeps job requirements separate", () => {
    const { brief, markdown } = buildApplicationBrief(
      report,
      profile,
      jobId,
      "2026-10-02T11:00:00.000Z",
    );
    expect(brief.job.url).toBe("https://example.com/jobs/1");
    expect(brief.candidate.facts[0]?.evidence[0]?.id).toBe("portfolio");
    expect(markdown).toContain("[react-project; project; documented]");
    expect(markdown).toContain("> React in production");
    expect(markdown).toContain("Vue");
    expect(markdown).toContain("ничего не отправляй автоматически");
    expect(markdown).not.toContain("5 years of commercial experience");
  });

  it("refuses a stale profile or unknown job", () => {
    expect(() =>
      buildApplicationBrief(
        { ...report, profileHash: "stale" },
        profile,
        jobId,
        "2026-10-02T11:00:00.000Z",
      ),
    ).toThrow("Профиль изменился");
    expect(() =>
      buildApplicationBrief(
        report,
        profile,
        "00000000-0000-4000-8000-000000000000",
        "2026-10-02T11:00:00.000Z",
      ),
    ).toThrow("Вакансия отсутствует");
  });
});
