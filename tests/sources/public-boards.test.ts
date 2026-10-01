import { describe, it, expect } from "vitest";
import {
  boardUrl,
  listingLinks,
  jobPostings,
  normalizePosting,
  rssJobs,
  PublicBoardSource,
} from "../../src/sources/public-boards.js";
import { importedJobs } from "../../src/sources/imported-jobs.js";
const context = { runId: "test", startedAt: new Date("2026-10-01T00:00:00Z") };
const posting = {
  "@type": "JobPosting",
  title: "Junior Developer",
  description: "Python required",
  hiringOrganization: { name: "Example" },
  jobLocation: { address: { addressCountry: "PL", addressLocality: "Opole" } },
};
const html = `<script type="application/ld+json">${JSON.stringify({ "@graph": [posting] })}</script>`;
describe("public boards", () => {
  it("accepts Bulldogjob detail URLs but not search pages", () => {
    expect(
      boardUrl("https://bulldogjob.pl/companies/jobs/123-junior-dev", "bulldogjob"),
    ).not.toBeNull();
    expect(boardUrl("https://bulldogjob.pl/companies/jobs/s/junior", "bulldogjob")).toBeNull();
  });
  it("skips explicit non-IT occupations even on IT boards", () => {
    expect(
      normalizePosting(
        { ...posting, title: "International Driver C+E" },
        "nofluffjobs",
        "https://nofluffjobs.com/pl/job/driver",
        context,
      ),
    ).toBeNull();
  });
  it("balances the four No Fluff Jobs categories within a shared limit", async () => {
    const calls: string[] = [];
    const result = await new PublicBoardSource(
      "nofluffjobs",
      4,
      async (url) => {
        calls.push(url);
        if (!url.includes("/job/"))
          return {
            status: 200,
            text: `<a href="/pl/job/${url.split("/").at(-1)}-one"></a><a href="/pl/job/${url.split("/").at(-1)}-two"></a>`,
          };
        return { status: 200, text: html };
      },
      0,
    ).discover(context);
    expect(result.jobs).toHaveLength(4);
    expect(calls.slice(4).map((url) => url.split("/").at(-1))).toEqual([
      "backend-one",
      "frontend-one",
      "testing-one",
      "support-one",
    ]);
  });
  it("does not prioritize international as an internship", () => {
    const links = listingLinks(
      '<a href="/pl/job/international-driver"></a><a href="/pl/job/junior-developer"></a>',
      "nofluffjobs",
    );
    expect(links[0]).toBe("https://nofluffjobs.com/pl/job/junior-developer");
  });
  it("finds only same-host job links, strips tracking, prefers junior", () => {
    expect(
      listingLinks(
        '<a href="/job-offer/senior"></a><a href="https://evil.test/job-offer/junior"></a><a href="/job-offer/junior?utm_source=x"></a>',
        "justjoin",
      ),
    ).toEqual(["https://justjoin.it/job-offer/junior", "https://justjoin.it/job-offer/senior"]);
  });
  it.each([
    "http://justjoin.it/job-offer/x",
    "https://justjoin.it.evil.test/job-offer/x",
    "https://user:pass@justjoin.it/job-offer/x",
    "https://justjoin.it:999/job-offer/x",
  ])("rejects unsafe link %s", (url) => {
    expect(boardUrl(url, "justjoin")).toBeNull();
  });
  it("reads graph JSON-LD without executing other scripts", () => {
    expect(jobPostings("<script>throw 1</script>" + html)).toEqual([posting]);
  });
  it("keeps explicit Polish locations and unknown workplace type", () => {
    expect(
      normalizePosting(posting, "justjoin", "https://justjoin.it/job-offer/x", context),
    ).toMatchObject({
      company: "Example",
      location: "Opole, pl",
      workplaceType: "unknown",
      salaryMin: null,
    });
  });
  it("skips foreign-only and expired postings", () => {
    expect(
      normalizePosting(
        { ...posting, validThrough: "2020-01-01" },
        "justjoin",
        "https://justjoin.it/job-offer/x",
        context,
      ),
    ).toBeNull();
    expect(
      normalizePosting(
        { ...posting, jobLocation: { address: { addressCountry: "US" } } },
        "justjoin",
        "https://justjoin.it/job-offer/x",
        context,
      ),
    ).toBeNull();
  });
  it("does not use a huge applicant country list as proof of Polish location", () => {
    expect(
      normalizePosting(
        { ...posting, jobLocation: null, applicantLocationRequirements: [{ name: "Poland" }] },
        "justjoin",
        "https://justjoin.it/job-offer/x",
        context,
      ),
    ).toBeNull();
  });
  it("reads IT-only RSS summaries and preserves source URLs", () => {
    const xml =
      "<rss><channel><item><category>IT</category><title>Junior</title><link>https://solid.jobs/o/a/rss</link><description>Example • Opole</description></item><item><category>Sales</category><title>Sales</title></item></channel></rss>";
    expect(rssJobs(xml, context, 8)[0]).toMatchObject({
      title: "Junior",
      company: "Example",
      source: "solidjobs",
    });
  });
  it("stops on access denial and preserves previously read jobs", async () => {
    let count = 0;
    const result = await new PublicBoardSource(
      "justjoin",
      3,
      async () => {
        count++;
        return count === 1
          ? {
              status: 200,
              text: '<a href="/job-offer/a"></a><a href="/job-offer/b"></a><a href="/job-offer/c"></a>',
            }
          : count === 2
            ? { status: 200, text: html }
            : { status: 403, text: "denied" };
      },
      0,
    ).discover(context);
    expect(count).toBe(3);
    expect(result.jobs).toHaveLength(1);
    expect(result.errors[0]?.message).toBe("HTTP_403");
  });
  it("reports an empty changed listing instead of claiming success", async () => {
    const result = await new PublicBoardSource(
      "justjoin",
      1,
      async () => ({ status: 200, text: "no links" }),
      0,
    ).discover(context);
    expect(result.errors[0]?.message).toBe("LISTING_CHANGED");
  });
});
describe("manual multi-platform import", () => {
  const record = {
    url: "https://www.olx.pl/oferta/praca/test.html",
    country: "PL",
    title: "Support",
    company: "Example",
    description: "Full user supplied description",
    location: "Opole",
  };
  it("imports a real record into the common job schema and deduplicates URLs", () => {
    expect(importedJobs([record, record], context.startedAt)).toHaveLength(1);
    expect(importedJobs([record], context.startedAt)[0]).toMatchObject({
      source: "olx",
      workplaceType: "unknown",
    });
  });
  it("rejects URL-only entries, foreign country and unknown hosts", () => {
    expect(() => importedJobs([{ url: record.url }], context.startedAt)).toThrow();
    expect(() => importedJobs([{ ...record, country: "US" }], context.startedAt)).toThrow();
    expect(() =>
      importedJobs([{ ...record, url: "https://evil.test/job/1" }], context.startedAt),
    ).toThrow();
  });
});
