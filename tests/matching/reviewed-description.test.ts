import { it, expect } from "vitest";
import { reviewedDescription } from "../../src/matching/reviewed-description.js";
const job = { id: "a", contentHash: "new", description: "original" };
const review = {
  jobId: "a",
  contentHash: "old",
  description: "reviewed",
  sourceUrl: "https://example.com",
  checkedAt: "2026-10-01",
};
it("ignores stale description reviews", () =>
  expect(reviewedDescription(job, [review]).description).toBe("original"));
it("uses a review only for its exact job and content version", () => {
  expect(reviewedDescription(job, [{ ...review, contentHash: "new" }]).description).toBe(
    "reviewed",
  );
  expect(
    reviewedDescription(job, [{ ...review, jobId: "b", contentHash: "new" }]).description,
  ).toBe("original");
});
