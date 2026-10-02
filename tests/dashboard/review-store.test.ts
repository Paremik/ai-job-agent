import { describe, expect, it } from "vitest";
import {
  recentApplications,
  updateReviewStore,
  type ReviewStore,
} from "../../src/dashboard/review-store.js";

const job = { url: "https://example.com/job/1", title: "Developer", company: "Example" };
const empty: ReviewStore = { version: 1, records: [] };

describe("dashboard review store", () => {
  it("keeps a submitted job in the archive when its status changes", () => {
    const sent = updateReviewStore(
      empty,
      { ...job, status: "sent", starred: true },
      "2026-10-02T08:00:00.000Z",
    );
    const replied = updateReviewStore(
      sent,
      { ...job, status: "reply", starred: true },
      "2026-10-03T08:00:00.000Z",
    );
    expect(recentApplications(replied)).toEqual([
      expect.objectContaining({
        status: "reply",
        starred: true,
        sentAt: "2026-10-02T08:00:00.000Z",
      }),
    ]);
  });

  it("shows only the latest 200 applications", () => {
    let store = empty;
    for (let index = 0; index < 201; index++) {
      store = updateReviewStore(
        store,
        { ...job, url: `https://example.com/job/${index}`, status: "sent", starred: false },
        new Date(Date.UTC(2026, 9, 2, 0, index)).toISOString(),
      );
    }
    const recent = recentApplications(store);
    expect(recent).toHaveLength(200);
    expect(recent[0]?.url).toBe("https://example.com/job/200");
    expect(recent.some((record) => record.url.endsWith("/0"))).toBe(false);
  });

  it("rejects unsafe links and preserves a star when updating a status", () => {
    expect(() =>
      updateReviewStore(
        empty,
        { ...job, url: "javascript:alert(1)", status: "sent", starred: false },
        "2026-10-02T08:00:00.000Z",
      ),
    ).toThrow();
    const starred = updateReviewStore(
      empty,
      { ...job, status: null, starred: true },
      "2026-10-02T08:00:00.000Z",
    );
    expect(
      updateReviewStore(
        starred,
        { ...job, status: "planned", starred: true },
        "2026-10-02T09:00:00.000Z",
      ).records[0]?.starred,
    ).toBe(true);
  });

  it("allows undoing an accidental sent mark", () => {
    const sent = updateReviewStore(
      empty,
      { ...job, status: "sent", starred: false },
      "2026-10-02T08:00:00.000Z",
    );
    const reset = updateReviewStore(
      sent,
      { ...job, status: null, starred: false },
      "2026-10-02T09:00:00.000Z",
    );
    expect(recentApplications(reset)).toEqual([]);
  });
});
