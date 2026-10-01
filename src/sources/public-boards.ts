import { createHash } from "node:crypto";
import { z } from "zod";
import { JobSchema, type Job } from "../domain/job.js";
import type { DiscoveryContext, JobSource, SourceResult } from "./job-source.js";

export const boards = {
  bulldogjob: {
    host: "bulldogjob.pl",
    listing: "https://bulldogjob.pl/companies/jobs/s/experienceLevel%2Cjunior",
    path: /^\/companies\/jobs\/\d+-[^/]+$/,
  },
  justjoin: {
    host: "justjoin.it",
    listing: "https://justjoin.it/job-offers/all-locations",
    path: /^\/job-offer\/[^/]+$/,
  },
  nofluffjobs: {
    host: "nofluffjobs.com",
    listing: "https://nofluffjobs.com/pl/backend",
    path: /^\/pl\/job\/[^/]+$/,
  },
  solidjobs: {
    host: "solid.jobs",
    listing: "https://solid.jobs/rss/job-offers",
    path: /^\/o\/[^/]+\/rss$/,
  },
} as const;
export type BoardName = keyof typeof boards;
const obj = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const str = (value: unknown) => (typeof value === "string" ? value.trim() : "");
export function decode(value: string) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(
      /&(amp|lt|gt|quot|apos);/g,
      (_, name: string) => ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" })[name] ?? "",
    );
}
export function boardUrl(value: string, name: BoardName): string | null {
  try {
    const url = new URL(decode(value), boards[name].listing);
    if (
      url.protocol !== "https:" ||
      url.hostname !== boards[name].host ||
      url.port ||
      url.username ||
      url.password ||
      !boards[name].path.test(url.pathname)
    )
      return null;
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}
export function listingLinks(html: string, name: BoardName): string[] {
  const urls = new Set<string>();
  for (const match of html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)) {
    const url = boardUrl(match[1]!, name);
    if (url) urls.add(url);
  }
  // Only reorder links actually present on the public listing page.
  return [...urls].sort(
    (a, b) =>
      Number(
        /(?:^|[/-])(?:junior|intern|internship|trainee|staz|stazowy|mlodszy)(?:[/-]|$)/i.test(b),
      ) -
      Number(
        /(?:^|[/-])(?:junior|intern|internship|trainee|staz|stazowy|mlodszy)(?:[/-]|$)/i.test(a),
      ),
  );
}
export function jobPostings(html: string): Record<string, unknown>[] {
  const result: Record<string, unknown>[] = [];
  const walk = (value: unknown, depth = 0) => {
    if (depth > 12 || !value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      for (const item of value) walk(item, depth + 1);
      return;
    }
    const object = obj(value);
    if (
      object["@type"] === "JobPosting" ||
      (Array.isArray(object["@type"]) && object["@type"].includes("JobPosting"))
    )
      result.push(object);
    // Follow only containers used for schema.org structured data, not arbitrary data.
    for (const key of ["@graph", "mainEntity", "itemListElement", "item"])
      if (object[key]) walk(object[key], depth + 1);
  };
  for (const match of html.matchAll(
    /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    try {
      walk(JSON.parse(match[1]!));
    } catch {
      /* Other scripts may be malformed; never execute them. */
    }
  }
  return result;
}
function makeJob(
  name: BoardName,
  url: string,
  fields: {
    title: string;
    company: string;
    description: string;
    location: string | null;
    remote: boolean;
  },
  context: DiscoveryContext,
): Job {
  const externalId = createHash("sha256").update(url).digest("hex");
  return JobSchema.parse({
    id: `${name}:${externalId}`,
    externalId,
    source: name,
    ...fields,
    workplaceType: fields.remote ? "remote" : "unknown",
    salaryMin: null,
    salaryMax: null,
    salaryCurrency: null,
    sourceUrl: url,
    canonicalUrl: url,
    discoveredAt: context.startedAt.toISOString(),
  });
}
export function normalizePosting(
  raw: Record<string, unknown>,
  name: BoardName,
  pageUrl: string,
  context: DiscoveryContext,
): Job | null {
  const url = boardUrl(pageUrl, name);
  if (!url) throw new Error("Unsupported URL");
  // These explicit occupations are outside this candidate's IT search. Do not
  // infer relevance from the board name or substring "intern" in international.
  if (
    /\b(?:driver|recruiter|rekruter|accountant|kierowca|księgowa|księgowy)\b/iu.test(str(raw.title))
  )
    return null;
  const expiry = str(raw.validThrough);
  if (
    expiry &&
    Number.isFinite(Date.parse(expiry)) &&
    Date.parse(expiry.length === 10 ? `${expiry}T23:59:59Z` : expiry) < context.startedAt.getTime()
  )
    return null;
  const places = Array.isArray(raw.jobLocation)
    ? raw.jobLocation
    : raw.jobLocation
      ? [raw.jobLocation]
      : [];
  const addresses = places.map((place) => obj(obj(place).address));
  const country = (address: Record<string, unknown>) =>
    (str(address.addressCountry) || str(obj(address.addressCountry).name)).toLowerCase();
  // Poland-first: require at least one explicit Polish office location. Remote
  // eligibility is still unresolved; a giant applicant-country list is not proof.
  if (!addresses.some((address) => ["pl", "pol", "poland", "polska"].includes(country(address))))
    return null;
  const location =
    addresses
      .map((address) => [str(address.addressLocality), country(address)].filter(Boolean).join(", "))
      .filter(Boolean)
      .join("; ") || null;
  const description = str(raw.description);
  const skills = Array.isArray(raw.skills)
    ? raw.skills
        .map((item) => (typeof item === "string" ? item : str(obj(item).value)))
        .filter(Boolean)
    : str(raw.skills)
      ? [str(raw.skills)]
      : [];
  const qualifications = [str(raw.qualifications), ...skills].filter(Boolean);
  return makeJob(
    name,
    url,
    {
      title: str(raw.title),
      company: str(obj(raw.hiringOrganization).name),
      location,
      description: `[Public structured posting; completeness not guaranteed. Verify the original.]\n${description}${qualifications.length ? `\nQualifications\n${qualifications.join("\n")}` : ""}`,
      remote: raw.jobLocationType === "TELECOMMUTE",
    },
    context,
  );
}
export function rssJobs(xml: string, context: DiscoveryContext, limit: number): Job[] {
  if (!/<rss\b/i.test(xml)) throw new Error("Invalid RSS");
  const records: Job[] = [];
  for (const item of xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)) {
    const body = item[1]!;
    if (!/<category>\s*IT\s*<\/category>/i.test(body)) continue;
    const field = (tag: string) =>
      decode(
        new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i").exec(body)?.[1] ?? "",
      ).trim();
    const url = boardUrl(field("link"), "solidjobs");
    const description = field("description");
    const firstLine = description.split("\n")[0] ?? "";
    const separator = firstLine.indexOf("•");
    if (!url || separator < 1 || !field("title")) continue;
    records.push(
      makeJob(
        "solidjobs",
        url,
        {
          title: field("title"),
          company: firstLine.slice(0, separator).trim(),
          description: `[RSS summary from Polish IT feed; location, expiry and full requirements need review.]\n${description}`,
          location: firstLine.slice(separator + 1).trim() || null,
          remote: false,
        },
        context,
      ),
    );
  }
  const unique = [...new Map(records.map((record) => [record.externalId, record])).values()];
  return unique
    .sort(
      (a, b) =>
        Number(/junior|intern|trainee|staż|młodszy/i.test(b.title)) -
        Number(/junior|intern|trainee|staż|młodszy/i.test(a.title)),
    )
    .slice(0, limit);
}
export type PageTransport = (url: string) => Promise<{ status: number; text: string }>;
export const fetchPage: PageTransport = async (url) => {
  const response = await fetch(url, {
    redirect: "error",
    signal: AbortSignal.timeout(20_000),
    headers: {
      "User-Agent": "AIJobAgent/1.0 (personal job search)",
      Accept: "text/html,application/rss+xml,application/xml",
    },
  });
  if (!response.ok) return { status: response.status, text: "" };
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Empty body");
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      length += chunk.value.byteLength;
      if (length > 8_000_000) throw new Error("Page too large");
      chunks.push(chunk.value);
    }
  } finally {
    await reader.cancel();
  }
  return { status: response.status, text: Buffer.concat(chunks).toString("utf8") };
};
export class PublicBoardSource implements JobSource {
  constructor(
    readonly name: BoardName,
    private readonly limit = 8,
    private readonly request: PageTransport = fetchPage,
    private readonly delayMs = 1000,
  ) {
    z.number().int().min(1).max(30).parse(limit);
    if (!(name in boards)) throw new Error("Unknown board");
  }
  async discover(context: DiscoveryContext): Promise<SourceResult> {
    const result: SourceResult = {
      jobs: [],
      stats: { fetched: 0, valid: 0, rejected: 0 },
      errors: [],
    };
    try {
      const listing = await this.request(boards[this.name].listing);
      if (listing.status !== 200) throw new Error(`HTTP_${listing.status}`);
      if (this.name === "solidjobs") {
        result.jobs = rssJobs(listing.text, context, this.limit);
        result.stats.fetched = result.jobs.length;
      } else {
        const pages = [listing.text];
        if (this.name === "nofluffjobs") {
          for (const category of ["frontend", "testing", "support"]) {
            await new Promise((resolve) => setTimeout(resolve, this.delayMs));
            const next = await this.request(`https://nofluffjobs.com/pl/${category}`);
            if (next.status !== 200) throw new Error(`HTTP_${next.status}`);
            pages.push(next.text);
          }
        }
        // Round-robin categories so backend doesn't crowd out testing/support.
        const groups = pages.map((page) => listingLinks(page, this.name));
        const candidates = new Set<string>();
        for (let index = 0; index < Math.max(...groups.map((group) => group.length)); index++) {
          for (const group of groups) if (group[index]) candidates.add(group[index]!);
        }
        const links = [...candidates].slice(0, this.limit);
        if (!links.length) throw new Error("LISTING_CHANGED");
        for (const url of links) {
          await new Promise((resolve) => setTimeout(resolve, this.delayMs));
          const page = await this.request(url);
          if ([401, 403, 429].includes(page.status)) throw new Error(`HTTP_${page.status}`);
          result.stats.fetched++;
          if (page.status === 404 || page.status === 410) {
            result.stats.rejected++;
            continue;
          }
          if (page.status !== 200) throw new Error(`HTTP_${page.status}`);
          const postings = jobPostings(page.text);
          if (postings.length !== 1) {
            result.stats.rejected++;
            result.errors.push({
              code: "POSTING_CHANGED",
              message: "A page did not contain one unambiguous JobPosting.",
              retryable: false,
            });
            continue;
          }
          try {
            const job = normalizePosting(postings[0]!, this.name, url, context);
            if (job) result.jobs.push(job);
            else result.stats.rejected++;
          } catch {
            result.stats.rejected++;
            result.errors.push({
              code: "INVALID_POSTING",
              message: "A posting lacked required fields.",
              retryable: false,
            });
          }
        }
      }
    } catch (error) {
      result.errors.push({
        code: "BOARD_FETCH_FAILED",
        message:
          error instanceof Error && /^(HTTP_\d+|LISTING_CHANGED)$/.test(error.message)
            ? error.message
            : "Public feed unavailable or changed; no retries or access-control bypass attempted.",
        retryable: false,
      });
    }
    result.stats.valid = result.jobs.length;
    return result;
  }
}
