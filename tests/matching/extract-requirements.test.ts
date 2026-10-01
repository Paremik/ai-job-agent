import { describe, expect, it } from "vitest";
import {
  extractRequirements,
  RequirementsSchema,
} from "../../src/matching/extract-requirements.js";
import { descriptionText } from "../../src/matching/extract-location.js";

describe("structured requirement extraction", () => {
  it("uses explicit sections and does not treat company technologies as requirements", () => {
    const result = extractRequirements(
      "About us\nWe use Python.\nMinimum qualifications\nExperience with TypeScript and Node.js\nPreferred qualifications\nDocker\nBenefits\nWe offer Python training.",
    );
    expect(result.statements).toHaveLength(2);
    expect(result.statements[0]).toMatchObject({
      importance: "required",
      skills: ["TypeScript", "Node.js"],
    });
    expect(result.statements[1]).toMatchObject({ importance: "preferred", skills: ["Docker"] });
  });
  it("keeps ambiguous qualification sections unspecified", () => {
    expect(
      extractRequirements("You may be a good fit if you have:\nPython").statements[0]?.importance,
    ).toBe("unspecified");
  });
  it("preserves scoped experience quantities without summing", () => {
    const statements = extractRequirements(
      "Minimum qualifications\n3-5 years of Python experience and 2+ years of SQL experience",
    ).statements;
    expect(statements[0]?.experienceYears.map((years) => [years.min, years.max])).toEqual([
      [3, 5],
      [2, null],
    ]);
  });
  it("does not extract age, company tenure or leave allowances as years of experience", () => {
    const result = extractRequirements(
      "Requirements\nMust be 18 years old; we offer 5 years of benefits.\nCompany founded 20 years ago.",
    );
    expect(result.statements.flatMap((item) => item.experienceYears)).toEqual([]);
  });
  it("does not turn negated experience into a mandatory requirement", () => {
    const row = extractRequirements("Minimum qualifications\nNo Python experience required")
      .statements[0];
    expect(row).toMatchObject({ importance: "not_required", needsReview: true });
  });
  it("leaves mixed mandatory and preferred clauses for review", () => {
    expect(extractRequirements("Python required; SQL preferred").statements[0]).toMatchObject({
      importance: "unspecified",
      needsReview: true,
    });
  });
  it("retains education alternatives", () => {
    expect(
      extractRequirements("Minimum qualifications\nBachelor's degree or equivalent experience")
        .statements[0],
    ).toMatchObject({ conditions: ["education"], needsReview: true });
  });
  it("does not invent CEFR from fluent", () => {
    expect(extractRequirements("Requirements\nFluent in English").statements[0]?.languages).toEqual(
      [{ name: "English", cefr: null }],
    );
  });
  it("does not turn an upper bound or negated years into a minimum", () => {
    for (const text of [
      "Up to 3 years of experience",
      "5 years of experience not required",
      "More than 2 years of experience",
    ]) {
      const row = extractRequirements("Minimum qualifications\n" + text).statements[0];
      expect(row?.experienceYears).toEqual([]);
      expect(row?.needsReview).toBe(true);
    }
  });
  it("does not confuse ordinary verbs with technology names", () => {
    expect(
      extractRequirements("Requirements\nReact to incidents and excel at communication")
        .statements[0]?.skills,
    ).toEqual([]);
  });
  it("extracts explicit CEFR, defers ambiguous language lists", () => {
    expect(extractRequirements("Requirements\nEnglish B2").statements[0]?.languages).toEqual([
      { name: "English", cefr: "B2" },
    ]);
    const row = extractRequirements("Requirements\nEnglish B2 and Polish C1").statements[0];
    expect(row?.languages.every((language) => language.cefr === null)).toBe(true);
    expect(row?.needsReview).toBe(true);
  });
  it("matches technology boundaries including C++ and does not confuse JavaScript with Java", () => {
    expect(
      extractRequirements("Requirements\nJavaScript, C++, PostgreSQL and GitHub").statements[0]
        ?.skills,
    ).toEqual(["JavaScript", "C++", "PostgreSQL"]);
  });
  it("supports Polish sections and requirements", () => {
    const result = extractRequirements(
      "Wymagania:\nZnajomość Python\n3 lata doświadczenia\nMile widziane:\nDocker",
    );
    expect(result.statements[0]?.importance).toBe("required");
    expect(result.statements[1]?.experienceYears[0]?.min).toBe(3);
    expect(result.statements[2]?.importance).toBe("preferred");
  });
  it("retains verifiable evidence offsets through encoded HTML and bullets", () => {
    const input = "&lt;h2&gt;Requirements&lt;/h2&gt;&lt;li&gt; • Python required &lt;/li&gt;";
    const result = extractRequirements(input);
    for (const { evidence } of result.statements)
      expect(descriptionText(input).slice(evidence.start, evidence.end)).toBe(evidence.text);
    expect(result.statements).toHaveLength(1);
  });
  it("ends a section at an unknown heading", () => {
    expect(
      extractRequirements("Minimum qualifications\nPython\nOur culture:\nDocker events").statements,
    ).toHaveLength(1);
  });
  it("preserves unsupported qualifications and makes partial coverage explicit", () => {
    const result = extractRequirements("Minimum qualifications\nAbility to manage stakeholders");
    expect(result.coverage).toBe("partial");
    expect(result.statements[0]?.needsReview).toBe(true);
    expect(RequirementsSchema.safeParse(result).success).toBe(true);
  });
  it("handles empty and unrecognized descriptions without claiming no requirements", () => {
    const result = extractRequirements("");
    expect(result.coverage).toBe("none");
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});
