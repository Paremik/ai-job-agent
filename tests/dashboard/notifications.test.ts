import { describe, expect, it } from "vitest";
import { syncNotifications } from "../../src/dashboard/notifications.js";
import type { ReviewStore } from "../../src/dashboard/review-store.js";

const base = {
  id: "one",
  title: "Junior React Developer",
  company: "Example",
  canonicalUrl: "https://example.com/jobs/one",
  location: "Opole",
  workplaceType: "hybrid",
  locationDecision: { status: "needs_review", explanation: "Confirm office days" },
  comparison: { matchedSkills: ["React"], skillsWithoutEvidence: [], statements: [] },
  priority: {
    tier: "entry",
    titleLevel: "entry",
    signals: { targetRole: "development" },
    reasons: [],
  },
  screening: {
    status: "clarify_first",
    reasons: ["Confirm conditions"],
    applicationAllowed: false,
  },
};
const report = (rows: unknown[]) => ({ generatedAt: "2026-10-03T12:00:00Z", rows });
const reviews: ReviewStore = { version: 1, records: [] };

describe("local notifications", () => {
  it("establishes a quiet baseline and alerts only on new relevant junior jobs", () => {
    const first = syncNotifications(null, report([base]), reviews, "2026-10-03");
    expect(first.notifications).toEqual([]);
    const newJob = { ...base, id: "two", canonicalUrl: "https://example.com/jobs/two" };
    const deferred = {
      ...base,
      id: "three",
      canonicalUrl: "https://example.com/jobs/three",
      screening: { ...base.screening, status: "defer" },
    };
    const distant = {
      ...base,
      id: "four",
      canonicalUrl: "https://example.com/jobs/four",
      location: "Gdańsk",
    };
    const next = syncNotifications(
      first.store,
      report([base, newJob, deferred, distant]),
      reviews,
      "2026-10-03",
    );
    expect(next.notifications.map((item) => item.url)).toEqual([newJob.canonicalUrl]);
    const read = syncNotifications(
      next.store,
      report([base, newJob, deferred, distant]),
      reviews,
      "2026-10-03",
      next.notifications[0]!.id,
    );
    expect(read.notifications).toEqual([]);
    expect(
      syncNotifications(read.store, report([newJob]), reviews, "2026-10-03").notifications,
    ).toEqual([]);
  });

  it("uses the action date to avoid repeating a read reminder", () => {
    const review: ReviewStore = {
      version: 1,
      records: [
        {
          url: base.canonicalUrl,
          title: base.title,
          company: base.company,
          status: "planned",
          starred: false,
          updatedAt: "2026-10-03T12:00:00Z",
          sentAt: null,
          note: "",
          nextActionDate: "2026-10-03",
        },
      ],
    };
    const first = syncNotifications(null, report([base]), review, "2026-10-03");
    expect(first.notifications).toHaveLength(1);
    const read = syncNotifications(
      first.store,
      report([base]),
      review,
      "2026-10-03",
      first.notifications[0]!.id,
    );
    expect(read.notifications).toEqual([]);
    review.records[0]!.nextActionDate = "2026-10-04";
    expect(
      syncNotifications(read.store, report([base]), review, "2026-10-04").notifications,
    ).toHaveLength(1);
  });

  it("sends one alert for simultaneous possible duplicates and keeps acknowledgement stable", () => {
    const first = syncNotifications(null, report([]), reviews, "2026-10-03");
    const second = { ...base, id: "two", canonicalUrl: "https://example.com/jobs/two" };
    const grouped = syncNotifications(first.store, report([base, second]), reviews, "2026-10-03");
    expect(grouped.notifications).toHaveLength(1);
    const read = syncNotifications(
      grouped.store,
      report([base, second]),
      reviews,
      "2026-10-03",
      grouped.notifications[0]!.id,
    );
    expect(read.notifications).toEqual([]);
    expect(
      syncNotifications(read.store, report([second]), reviews, "2026-10-03").notifications,
    ).toEqual([]);
  });
});
