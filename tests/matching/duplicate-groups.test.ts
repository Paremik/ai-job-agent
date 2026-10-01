import { it, expect } from "vitest";
import { groupPossibleDuplicates } from "../../src/matching/duplicate-groups.js";
const row = (id: string, title = "Junior Tester", company = "Example", location = "Warsaw") => ({
  id,
  title,
  company,
  location,
  canonicalUrl: `https://example.com/${id}`,
});
it("groups title variants while preserving every source and location", () => {
  const groups = groupPossibleDuplicates([
    row("1"),
    row("2", "Junior Tester (K/M)", "Example Sp. z o.o.", "Krakow"),
  ]);
  expect(groups).toHaveLength(1);
  expect(groups[0]?.members).toHaveLength(2);
  expect(groups[0]?.locations).toEqual(["Warsaw", "Krakow"]);
  expect(groups[0]?.confidence).toBe("possible_duplicate");
});
it("keeps employers, levels, C++ and C# distinct", () => {
  const rows = [
    row("1"),
    row("2", "Senior Tester"),
    row("3", "Junior Tester", "Other"),
    row("4", "C++ Developer"),
    row("5", "C# Developer"),
  ];
  expect(groupPossibleDuplicates(rows)).toHaveLength(5);
});
