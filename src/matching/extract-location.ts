import type { WorkLocation } from "./location-filter.js";

export type LocationExtraction = {
  version: 1;
  location: WorkLocation;
  evidence: { field: string; quote: string }[];
  issues: string[];
};

// Decode escaped HTML before stripping tags: some feeds escape it twice.
export function descriptionText(input: string): string {
  let text = input;
  for (let pass = 0; pass < 3; pass += 1) {
    text = text.replace(/&(?:amp|lt|gt|quot|apos|nbsp|#\d+|#x[\da-f]+);/gi, (entity) => {
      const named: Record<string, string> = {
        "&amp;": "&",
        "&lt;": "<",
        "&gt;": ">",
        "&quot;": '"',
        "&apos;": "'",
        "&nbsp;": " ",
      };
      if (entity[1] !== "#") return named[entity.toLowerCase()] ?? entity;
      const hex = entity[2]?.toLowerCase() === "x";
      const code = Number.parseInt(entity.slice(hex ? 3 : 2, -1), hex ? 16 : 10);
      return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff)
        ? String.fromCodePoint(code)
        : " ";
    });
  }
  return text
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<\/?(?:p|li|div|br|h[1-6])\b[^>]*>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/[\t \r]+/g, " ");
}

const countries: Record<string, string> = {
  poland: "PL",
  polska: "PL",
  germany: "DE",
  "united kingdom": "GB",
  "united states": "US",
  canada: "CA",
  singapore: "SG",
  france: "FR",
};

export function extractLocation(description: string, homeCountry: string): LocationExtraction {
  const location: WorkLocation = {
    workplaceType: "unknown",
    city: null,
    country: null,
    oneWayCommuteMinutes: null,
    remoteAllowedFromHome: null,
  };
  const result: LocationExtraction = { version: 1, location, evidence: [], issues: [] };
  const sentences = descriptionText(description)
    .split(/[.!?\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const modes = new Set<WorkLocation["workplaceType"]>();
  const remoteCountries = new Set<string>();
  let hasCountryRule = false;
  let remoteBlocker = false;
  for (const sentence of sentences) {
    const add = (mode: WorkLocation["workplaceType"]) => {
      modes.add(mode);
      result.evidence.push({ field: "workplaceType", quote: sentence });
    };
    // Whole-sentence, employment-specific rules avoid "hybrid events", remote
    // customers and negated/hypothetical benefits. Unrecognized wording stays unknown.
    if (
      /^(?:this (?:role|position|job) is|work (?:arrangement|model):) (?:fully |100% )?remote$/i.test(
        sentence,
      )
    )
      add("remote");
    if (
      /^(?:this (?:role|position|job) is|work (?:arrangement|model):) (?:a )?hybrid(?: (?:role|position))?$/i.test(
        sentence,
      )
    )
      add("hybrid");
    if (
      /^(?:this (?:role|position|job) is|work (?:arrangement|model):) (?:fully |100% )?(?:on-site|onsite)$/i.test(
        sentence,
      )
    )
      add("onsite");
    if (
      /^this role (?:is expected to be |requires (?:being )?)in (?:the )?office 5 days per week$/i.test(
        sentence,
      )
    )
      add("onsite");
    if (/^please note this role requires [1-4] days in (?:the )?office per week$/i.test(sentence))
      add("hybrid");
    if (
      /^(?:location-based hybrid policy: )?(?:currently, )?we expect all staff to be in one of our offices at least 25% of the time$/i.test(
        sentence,
      )
    )
      add("hybrid");

    const remote =
      /^(?:this (?:role|position|job) (?:is (?:fully |100% )?remote|can be performed remotely)|you can work remotely) (?:from|in) (?:anywhere in )?(poland|polska|germany|united kingdom|united states|canada|singapore|france|the world|worldwide)( only)?$/i.exec(
        sentence,
      );
    if (remote) {
      add("remote");
      hasCountryRule = true;
      const country = countries[remote[1]!.toLowerCase()];
      // Naming one allowed country does not exclude all others unless "only".
      if (country === homeCountry || !country) remoteCountries.add("allowed");
      else if (remote[2]) remoteCountries.add("denied");
      else remoteCountries.add("unknown");
      result.evidence.push({ field: "remoteAllowedFromHome", quote: sentence });
    }
    if (
      !remote &&
      (/\b(?:must (?:be|live|reside)|required to (?:be|live|reside)|not (?:a )?(?:fully )?remote|no remote|cannot work remotely|residen(?:t|ce|cy))\b/i.test(
        sentence,
      ) ||
        (/\b(?:only|except|excluding|subject to|depending on)\b/i.test(sentence) &&
          /\b(?:remote|workplace|office|onsite|on-site|hybrid|location|country|countries|poland|polska|germany|reside|resident)\b/i.test(
            sentence,
          )))
    )
      remoteBlocker = true;

    const office =
      /^this (?:role|position|job) (?:will be|is) based in our ([\p{L} -]+), (Poland|Polska|Germany|United Kingdom|United States|Canada|Singapore|France) office$/iu.exec(
        sentence,
      );
    if (office) {
      const city = office[1]!.trim();
      const country = countries[office[2]!.toLowerCase()]!;
      if (location.city && (location.city !== city || location.country !== country))
        result.issues.push("CONFLICTING_OFFICE_LOCATIONS");
      else {
        location.city = city;
        location.country = country;
      }
      result.evidence.push({ field: "city,country", quote: sentence });
    }
  }
  if (modes.size === 1) location.workplaceType = [...modes][0]!;
  if (modes.size > 1) result.issues.push("CONFLICTING_WORK_MODES");
  if (hasCountryRule && remoteCountries.size === 1 && !remoteBlocker) {
    if (remoteCountries.has("allowed")) location.remoteAllowedFromHome = true;
    if (remoteCountries.has("denied")) location.remoteAllowedFromHome = false;
  }
  if (hasCountryRule && (remoteBlocker || remoteCountries.size > 1))
    result.issues.push("REMOTE_CONDITIONS_NEED_REVIEW");
  if (result.issues.length) {
    // Contradictions or additional restrictions prevent a firm automatic decision.
    location.workplaceType = "unknown";
    location.city = null;
    location.country = null;
    location.remoteAllowedFromHome = null;
  }
  return result;
}
