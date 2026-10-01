import { describe, it, expect } from "vitest";
import { jobPriority, compareJobPriority } from "../../src/matching/job-priority.js";
import { extractRequirements } from "../../src/matching/extract-requirements.js";
const rank = (title: string, text = "", location = "needs_review") =>
  jobPriority(title, extractRequirements(text), location);
describe("entry-level search priority", () => {
  it.each([
    "Junior Developer",
    "Software Engineering Intern",
    "Graduate Engineer",
    "Młodszy programista",
  ])("promotes %s", (title) => {
    expect(rank(title).tier).toBe("entry");
  });
  it.each([
    "Senior Web Engineer",
    "Staff Software Engineer",
    "Staff+ Research Engineer",
    "Principal Engineer",
    "Engineering Manager",
  ])("lowers %s", (title) => {
    expect(rank(title).tier).toBe("experienced");
  });
  it.each([
    "Front Desk Staff",
    "Lead Generation Specialist",
    "Software Engineer",
    "Internal Tools Developer",
  ])("leaves ambiguous %s for review", (title) => {
    expect(rank(title).tier).toBe("review");
  });
  it("does not treat mixed titles as a definite senior-only opening", () => {
    expect(rank("Junior / Senior Developer").tier).toBe("review");
  });
  it("lowers a junior title with mandatory 3 years", () => {
    expect(
      rank("Junior Developer", "Minimum qualifications\n3 years of Python experience").tier,
    ).toBe("experienced");
  });
  it("keeps the boundary explicit", () => {
    expect(
      rank("Junior Developer", "Minimum qualifications\n2 years of Python experience").tier,
    ).toBe("review");
  });
  it.each([
    "Preferred qualifications\n5 years of Python experience",
    "Minimum qualifications\n5 years of Python experience or equivalent education",
    "5 years of experience not required",
  ])("does not penalize soft/ambiguous experience: %s", (text) => {
    expect(rank("Junior Developer", text).tier).toBe("entry");
  });
  it("uses largest minimum, not the sum", () => {
    expect(
      rank(
        "Engineer",
        "Minimum qualifications\n2 years of Python experience\n2 years of SQL experience",
      ).largestExplicitMinimumYears,
    ).toBe(2);
  });
  it("places known location mismatches last and retains unknowns", () => {
    expect(rank("Intern", "", "ineligible").tier).toBe("location_mismatch");
    expect(rank("Intern").tier).toBe("entry");
  });
  it("orders seniority before skill counts, deterministically", () => {
    const rows = [
      {
        id: "senior",
        priority: rank("Senior Engineer"),
        comparison: { matchedSkills: ["Python", "React"] },
      },
      { id: "junior", priority: rank("Junior Engineer"), comparison: { matchedSkills: [] } },
    ];
    expect(rows.sort(compareJobPriority)[0]?.id).toBe("junior");
  });
});
