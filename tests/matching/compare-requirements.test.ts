import { describe, expect, it } from "vitest";
import example from "../../config/candidate-profile.example.json" with { type: "json" };
import { CandidateProfileSchema } from "../../src/domain/candidate-profile.js";
import { extractRequirements } from "../../src/matching/extract-requirements.js";
import { compareRequirements } from "../../src/matching/compare-requirements.js";

const profile = CandidateProfileSchema.parse({
  ...example,
  evidence: [
    ...example.evidence,
    { id: "repo", kind: "github", reference: "https://example.com/repo" },
    { id: "cv", kind: "cv", reference: "CV" },
  ],
  facts: [
    {
      id: "project",
      category: "project",
      statement: "Python project",
      evidenceIds: ["repo"],
      basis: "documented",
      skillUses: ["Python"],
    },
    {
      id: "language",
      category: "language",
      statement: "English B1",
      evidenceIds: ["cv"],
      basis: "documented",
      languageLevels: [{ name: "English", cefr: "B1" }],
    },
  ],
});
const compare = (text: string) => compareRequirements(profile, extractRequirements(text));

describe("evidence-based requirement comparison", () => {
  it("links exact skills to facts without claiming proficiency", () => {
    const result = compare("Minimum qualifications\nPython");
    expect(result.matchedSkills).toEqual(["Python"]);
    expect(result.statements[0]?.findings[0]).toMatchObject({
      status: "related_evidence",
      factIds: ["project"],
      evidenceIds: ["repo"],
    });
    expect(result.reviewRequired).toBe(true);
  });
  it("treats missing evidence as unknown, not inability", () => {
    const result = compare("Minimum qualifications\nJava");
    expect(result.skillsWithoutEvidence).toEqual(["Java"]);
    expect(result.statements[0]?.findings[0]?.status).toBe("no_evidence");
  });
  it("does not infer skills from free text or related technologies", () => {
    const untagged = { ...profile, facts: [{ ...profile.facts[0]!, skillUses: [] }] };
    expect(
      compareRequirements(untagged, extractRequirements("Minimum qualifications\nPython"))
        .matchedSkills,
    ).toEqual([]);
    expect(compare("Minimum qualifications\nSQL").matchedSkills).toEqual([]);
  });
  it("does not convert projects into years of employment", () => {
    const result = compare("Minimum qualifications\n5 years of Python experience");
    expect(
      result.statements[0]?.findings.find((finding) => finding.kind === "experience")?.status,
    ).toBe("needs_review");
  });
  it("keeps alternative branches grouped for review", () => {
    const result = compare("Minimum qualifications\nPython or Java");
    expect(
      result.statements[0]?.findings.every((finding) => finding.status === "needs_review"),
    ).toBe(true);
    expect(result.statements[0]?.requirement.evidence.text).toBe("Python or Java");
  });
  it("ignores explicit non-requirements", () => {
    const result = compare("No Python experience required");
    expect(result.matchedSkills).toEqual([]);
    expect(result.statements[0]?.ignored).toBe(true);
  });
  it("keeps preference importance", () => {
    expect(compare("Preferred qualifications\nPython").statements[0]?.requirement.importance).toBe(
      "preferred",
    );
  });
  it("compares only explicit unambiguous language levels against declared levels", () => {
    expect(compare("Minimum qualifications\nEnglish B2").statements[0]?.findings[0]?.status).toBe(
      "declared_level_below",
    );
    expect(compare("Minimum qualifications\nEnglish B1").statements[0]?.findings[0]?.status).toBe(
      "declared_level_meets",
    );
    expect(
      compare("Minimum qualifications\nFluent in English").statements[0]?.findings[0]?.status,
    ).toBe("needs_review");
  });
  it("does not choose between conflicting language facts", () => {
    const conflicting = {
      ...profile,
      facts: [
        ...profile.facts,
        {
          ...profile.facts[1]!,
          id: "other",
          languageLevels: [{ name: "English", cefr: "C1" as const }],
        },
      ],
    };
    expect(
      compareRequirements(conflicting, extractRequirements("Minimum qualifications\nEnglish B2"))
        .statements[0]?.findings[0]?.status,
    ).toBe("needs_review");
  });
  it("does not assume degree completion, authorization or schedule", () => {
    const result = compare(
      "Minimum qualifications\nBachelor's degree\nRight to work required\nMust work night shifts",
    );
    expect(
      result.statements
        .flatMap((statement) => statement.findings)
        .every((finding) => finding.status === "needs_review"),
    ).toBe(true);
  });
  it("does not count repeated mentions as extra matches", () => {
    expect(compare("Minimum qualifications\nPython\nExperience with Python").matchedSkills).toEqual(
      ["Python"],
    );
  });
  it("requires review when extraction finds nothing", () => {
    expect(compare("")).toMatchObject({ matchedSkills: [], reviewRequired: true, statements: [] });
  });
  it("validates profile tags and their evidence", () => {
    expect(
      CandidateProfileSchema.safeParse({
        ...profile,
        facts: [{ ...profile.facts[0], category: "education" }],
      }).success,
    ).toBe(false);
    expect(
      CandidateProfileSchema.safeParse({
        ...profile,
        facts: [{ ...profile.facts[1], evidenceIds: ["missing"] }],
      }).success,
    ).toBe(false);
  });
});
