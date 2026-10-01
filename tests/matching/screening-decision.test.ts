import { describe, expect, it } from "vitest";
import example from "../../config/candidate-profile.example.json" with { type: "json" };
import { CandidateProfileSchema } from "../../src/domain/candidate-profile.js";
import { compareRequirements } from "../../src/matching/compare-requirements.js";
import { extractRequirements } from "../../src/matching/extract-requirements.js";
import { jobPriority } from "../../src/matching/job-priority.js";
import { prioritySignals } from "../../src/matching/priority-signals.js";
import { screeningDecision } from "../../src/matching/screening-decision.js";

const profile = CandidateProfileSchema.parse({
  ...example,
  evidence: [
    ...example.evidence,
    { id: "repo", kind: "github", reference: "https://example.com" },
    { id: "cv", kind: "cv", reference: "CV" },
  ],
  facts: [
    {
      id: "project",
      category: "project",
      statement: "React project",
      evidenceIds: ["repo"],
      basis: "documented",
      skillUses: ["React"],
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

const decision = (
  title: string,
  description: string,
  location: "eligible" | "ineligible" | "needs_review" = "eligible",
  decisionSource: "manual_review" | "description_rules" = "manual_review",
) => {
  const requirements = extractRequirements(description);
  const comparison = compareRequirements(profile, requirements);
  const signals = prioritySignals(title, description, profile, comparison);
  const priority = jobPriority(title, requirements, location, signals);
  return screeningDecision(priority, { status: location, decisionSource });
};

describe("conservative screening decision", () => {
  it("puts a junior role with related evidence first without authorizing application", () => {
    expect(decision("Junior React Developer", "Minimum qualifications\nReact")).toMatchObject({
      status: "review_now",
      applicationAllowed: false,
    });
  });
  it("asks for details when requirements are missing or location is unknown", () => {
    expect(decision("Junior React Developer", "").status).toBe("clarify_first");
    expect(
      decision("Junior React Developer", "Minimum qualifications\nReact", "needs_review").status,
    ).toBe("clarify_first");
  });
  it("does not turn missing evidence or a language gap into rejection", () => {
    expect(decision("Junior Developer", "Minimum qualifications\nJava").status).toBe(
      "clarify_first",
    );
    expect(decision("Junior Developer", "Minimum qualifications\nEnglish B2").status).toBe(
      "clarify_first",
    );
  });
  it("does not defer because a preferred skill lacks evidence", () => {
    expect(
      decision(
        "Junior React Developer",
        "Minimum qualifications\nReact\nPreferred qualifications\nJava",
      ).status,
    ).toBe("review_now");
  });
  it("defers a confirmed location conflict, but reviews heuristic conflicts", () => {
    const description = "Minimum qualifications\nReact";
    expect(
      decision("Junior React Developer", description, "ineligible", "manual_review").status,
    ).toBe("defer");
    expect(
      decision("Junior React Developer", description, "ineligible", "description_rules").status,
    ).toBe("clarify_first");
  });
  it("lowers senior roles and clear required 3-year minimums without deleting them", () => {
    expect(decision("Senior React Developer", "Minimum qualifications\nReact").status).toBe(
      "defer",
    );
    expect(
      decision("Junior React Developer", "Minimum qualifications\n3 years of React experience")
        .status,
    ).toBe("defer");
  });
});
