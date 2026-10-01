import { describe, it, expect } from "vitest";
import example from "../../config/candidate-profile.example.json" with { type: "json" };
import { CandidateProfileSchema } from "../../src/domain/candidate-profile.js";
import { extractRequirements } from "../../src/matching/extract-requirements.js";
import { compareRequirements } from "../../src/matching/compare-requirements.js";
import { prioritySignals } from "../../src/matching/priority-signals.js";
import { jobPriority, compareJobPriority } from "../../src/matching/job-priority.js";
const profile = CandidateProfileSchema.parse({
  ...example,
  evidence: [...example.evidence, { id: "cv", kind: "cv", reference: "CV" }],
  facts: [
    {
      id: "python",
      category: "project",
      statement: "Python project",
      basis: "documented",
      evidenceIds: ["cv"],
      skillUses: ["Python"],
    },
    {
      id: "english",
      category: "language",
      statement: "English B1",
      basis: "documented",
      evidenceIds: ["cv"],
      languageLevels: [{ name: "English", cefr: "B1" }],
    },
  ],
});
function row(id: string, text: string, title = "Junior Engineer") {
  const requirements = extractRequirements(text);
  const comparison = compareRequirements(profile, requirements);
  const signals = prioritySignals(title, text, profile, comparison);
  return { id, comparison, priority: jobPriority(title, requirements, "eligible", signals) };
}
describe("review-aware priority", () => {
  it("does not let preferred Python hide mandatory C++", () => {
    const weak = row("a", "Minimum qualifications\nC++\nWould be a plus / Mile widziane\nPython");
    const strong = row("z", "Minimum qualifications\nPython");
    expect(weak.priority.signals?.requiredMissing).toContain("C++");
    expect(weak.priority.signals?.preferredMatches).toContain("Python");
    expect([weak, strong].sort(compareJobPriority)[0]?.id).toBe("z");
  });
  it("flags required language gap but not a preference", () => {
    expect(row("a", "Minimum qualifications\nEnglish B2").priority.signals?.languageGap).toBe(true);
    expect(row("a", "Preferred qualifications\nEnglish B2").priority.signals?.languageGap).toBe(
      false,
    );
  });
  it("requires review of a title language without inventing a level", () => {
    const value = row("a", "Minimum qualifications\nPython", "Junior Developer with German");
    expect(value.priority.signals?.languageReview).toBe(true);
    expect(value.priority.signals?.languageGap).toBe(false);
    expect(value.priority.tier).toBe("review");
  });
  it.each([
    "[Jooble search snippet — incomplete description]\nMinimum qualifications\nPython",
    "[RSS summary]\nPython",
    "Python",
  ])("does not promote incomplete text %s", (text) => {
    expect(row("a", text).priority.signals?.incomplete).toBe(true);
    expect(row("a", text).priority.tier).toBe("review");
  });
  it("does not treat mixed Junior/Mid as entry", () => {
    expect(row("a", "Minimum qualifications\nPython", "Junior / Mid Tester").priority.tier).toBe(
      "review",
    );
  });
  it("keeps location mismatch last", () => {
    const req = extractRequirements("Minimum qualifications\nPython");
    expect(jobPriority("Junior Developer", req, "ineligible").tier).toBe("location_mismatch");
  });
});
