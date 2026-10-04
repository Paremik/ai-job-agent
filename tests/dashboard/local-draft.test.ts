import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { CandidateProfileSchema } from "../../src/domain/candidate-profile.js";
import { buildApplicationBrief } from "../../src/dashboard/application-brief.js";
import { buildLocalDraft } from "../../src/dashboard/local-draft.js";

const jobId = "21916f05-64e2-4a0c-b2b5-c7e01880c801";
const evidence = [
  { id: "repo", kind: "github", reference: "https://github.com/example/ai-job-agent" },
  { id: "cv", kind: "cv", reference: "CV.pdf" },
] as const;
const profile = CandidateProfileSchema.parse({
  version: 1,
  displayName: "Example Person",
  evidence,
  facts: [
    {
      id: "agent",
      category: "project",
      statement: "TypeScript project with tests",
      basis: "documented",
      evidenceIds: ["repo"],
      skillUses: ["TypeScript", "Vitest"],
    },
    {
      id: "languages",
      category: "language",
      statement: "Polish B2",
      basis: "documented",
      evidenceIds: ["cv"],
      languageLevels: [{ name: "Polish", cefr: "B2" }],
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
    availableFrom: "2026-11-01",
    workAuthorization: null,
    evidenceIds: ["cv"],
  },
  unresolved: ["Confirm weekly hours"],
});
const profileHash = createHash("sha256").update(JSON.stringify(profile)).digest("hex");
const report = {
  generatedAt: "2026-10-02T10:00:00.000Z",
  profileHash,
  rows: [
    {
      id: jobId,
      title: "Junior Tester",
      company: "Example Company",
      canonicalUrl: "https://example.com/jobs/1",
      contentHash: "job-hash",
      location: "Warszawa",
      workplaceType: "remote",
      priority: { tier: "review", reasons: [] },
      screening: { status: "clarify_first", reasons: [] },
      comparison: {
        matchedSkills: ["TypeScript"],
        skillsWithoutEvidence: ["Robot Framework"],
        statements: [
          {
            ignored: false,
            requirement: { importance: "required", evidence: { text: "German B1" } },
            findings: [
              {
                kind: "language",
                label: "German",
                status: "needs_review",
                explanation: "No level confirmed",
                factIds: [],
                evidenceIds: [],
              },
            ],
          },
          {
            ignored: false,
            requirement: { importance: "required", evidence: { text: "Robot Framework" } },
            findings: [
              {
                kind: "skill",
                label: "Robot Framework",
                status: "no_evidence",
                explanation: "No evidence confirmed",
                factIds: [],
                evidenceIds: [],
              },
            ],
          },
        ],
      },
    },
  ],
};
const contact = {
  email: "person@example.com",
  phone: "+48 123 456 789",
  github: "https://github.com/example",
};

describe("local CV and letter drafts", () => {
  it("uses verified projects, leaves unsupported skills out of the CV, and keeps gaps in review notes", () => {
    const brief = buildApplicationBrief(report, profile, jobId, "2026-10-02T11:00:00.000Z").brief;
    const draft = buildLocalDraft(brief, contact, "2026-10-02T11:00:00.000Z");
    expect(draft.cvText).toContain("AI Job Application Agent");
    expect(draft.cvText).toContain("Polski B2");
    expect(draft.cvText).toContain("2026-11-01");
    expect(draft.cvText).not.toContain("Python");
    expect(draft.cvText).not.toContain("Robot Framework");
    expect(draft.letterText).toContain("Example Company");
    expect(draft.letterText).toContain("GitHub: https://github.com/example");
    expect(draft.letterText).toContain("nie mam jeszcze potwierdzenia pracy z: Robot Framework");
    expect(draft.letterText).toContain("Czy tę pracę zdalną można wykonywać z Polski?");
    expect(draft.reviewNotes.join(" ")).toContain("Robot Framework");
    expect(draft.reviewNotes.join(" ")).toContain("German B1");
    expect(draft.letterText).toContain(
      "nie przedstawiam go jako pełnoetatowego doświadczenia komercyjnego",
    );
  });

  it("tailors support drafts to documented practice without claiming Linux experience", () => {
    const supportProfile = CandidateProfileSchema.parse({
      ...profile,
      facts: [
        ...profile.facts,
        {
          id: "internships",
          category: "experience",
          statement:
            "Windows troubleshooting, PC assembly and monitoring-system installation in school internship",
          basis: "documented",
          evidenceIds: ["cv"],
        },
      ],
    });
    const supportReport = {
      ...report,
      profileHash: createHash("sha256").update(JSON.stringify(supportProfile)).digest("hex"),
      rows: [
        {
          ...report.rows[0],
          title: "Junior Linux Administrator",
          location: "Opole",
          workplaceType: "onsite",
        },
      ],
    };
    const brief = buildApplicationBrief(
      supportReport,
      supportProfile,
      jobId,
      "2026-10-02T11:00:00.000Z",
    ).brief;
    const draft = buildLocalDraft(brief, contact, "2026-10-02T11:00:00.000Z");
    expect(draft.letterText).toContain("instalowałem systemy monitoringu");
    expect(draft.letterText).toContain("administracji systemami");
    expect(draft.cvText).toContain("Diagnostyka Windows");
    expect(draft.letterText).not.toContain("administrowałem systemami Linux");
  });
});
