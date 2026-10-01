import { z } from "zod";
import { descriptionText } from "./extract-location.js";

export const RequirementsSchema = z.object({
  version: z.literal(1),
  method: z.literal("rules"),
  coverage: z.enum(["partial", "none"]),
  statements: z.array(
    z.object({
      importance: z.enum(["required", "preferred", "unspecified", "not_required"]),
      section: z.string().nullable(),
      evidence: z.object({
        text: z.string().min(1),
        start: z.number().int().nonnegative(),
        end: z.number().int().positive(),
      }),
      skills: z.array(z.string()),
      experienceYears: z.array(
        z.object({
          min: z.number().nonnegative(),
          max: z.number().nonnegative().nullable(),
          text: z.string(),
        }),
      ),
      languages: z.array(z.object({ name: z.string(), cefr: z.string().nullable() })),
      conditions: z.array(
        z.enum(["education", "work_authorization", "security_clearance", "travel", "schedule"]),
      ),
      needsReview: z.boolean(),
    }),
  ),
  warnings: z.array(z.string()),
});
export type Requirements = z.infer<typeof RequirementsSchema>;

const skillPatterns: [string, RegExp][] = [
  ["TypeScript", /\btypescript\b/i],
  ["JavaScript", /\bjavascript\b/i],
  ["React", /\breact(?:\.js|js)?\b/i],
  ["Next.js", /\bnext(?:\.js|js)\b/i],
  ["Node.js", /\bnode(?:\.js|js)\b/i],
  ["Python", /\bpython\b/i],
  ["Java", /\bjava\b/i],
  ["C++", /(?<![\w+])c\+\+(?!\+)/i],
  ["C#", /(?<!\w)c#(?!\w)/i],
  ["PHP", /\bphp\b/i],
  ["HTML", /\bhtml5?\b/i],
  ["CSS", /\bcss3?\b/i],
  ["SQL", /\bsql\b/i],
  ["PostgreSQL", /\bpostgres(?:ql)?\b/i],
  ["MySQL", /\bmysql\b/i],
  ["SQLite", /\bsqlite\b/i],
  ["Git", /\bgit\b/i],
  ["Docker", /\bdocker\b/i],
  ["Kubernetes", /\b(?:kubernetes|k8s)\b/i],
  ["Linux", /\blinux\b/i],
  ["AWS", /\b(?:aws|amazon web services)\b/i],
  ["Azure", /\bazure\b/i],
  ["Terraform", /\bterraform\b/i],
  ["Excel", /\bexcel\b/i],
];
const languagePatterns: [string, RegExp][] = [
  ["English", /\benglish\b|angielsk\p{L}*/iu],
  ["Polish", /\bpolish\b|polsk\p{L}*/iu],
  ["German", /\bgerman\b|niemieck\p{L}*/iu],
  ["French", /\bfrench\b/i],
  ["Ukrainian", /\bukrainian\b/i],
  ["Russian", /\brussian\b/i],
];

function heading(text: string): "required" | "preferred" | "unspecified" | "stop" | null {
  if (
    /^\s*(?:would be a plus(?:\s*\/\s*mile widziane)?|bonus points if you have)\s*:?\s*$/i.test(
      text,
    )
  )
    return "preferred";
  const value = text
    .toLowerCase()
    .replace(/[:\s]+$/g, "")
    .replace(/[’]/g, "'");
  if (
    /^(?:minimum|required|basic|essential) (?:qualifications|requirements|skills)$|^(?:must[- ]haves?|wymagania|nasze wymagania)$/.test(
      value,
    )
  )
    return "required";
  if (
    /^(?:(?:preferred|desired|additional) (?:qualifications|skills)|nice[- ]to[- ]haves?|bonus points|mile widziane|strong candidates may also have some of the following)$/.test(
      value,
    )
  )
    return "preferred";
  if (
    /^(?:qualifications|requirements|what you bring|who you are|about you|you may be a good fit if(?: you have)?|you might be a good fit if(?: you)?|what we're looking for)$/.test(
      value,
    )
  )
    return "unspecified";
  if (
    /^(?:(?:key )?responsibilities|(?:about )?(?:the role|the company|us|anthropic)|what we offer|benefits|logistics|compensation|annual salary|what you'll do|job description|additional information|oferujemy|obowiązki)$/.test(
      value,
    )
  )
    return "stop";
  return null;
}

export function extractRequirements(description: string): Requirements {
  const normalized = descriptionText(description);
  const statements: Requirements["statements"] = [];
  let section: string | null = null;
  let sectionImportance: "required" | "preferred" | "unspecified" | null = null;
  // Keep list items together: do not split Node.js, C++ or conditional alternatives.
  for (const match of normalized.matchAll(/[^\n]+/g)) {
    const raw = match[0];
    const text = raw.trim().replace(/^[-•]\s*/, "");
    if (!text) continue;
    const label = heading(text);
    if (label) {
      section = label === "stop" ? null : text;
      sectionImportance = label === "stop" ? null : label;
      continue;
    }
    // An unrecognized short heading closes the previous scope rather than allowing
    // a required section to leak into benefits or responsibilities.
    if (text.endsWith(":") && text.length < 100) {
      section = null;
      sectionImportance = null;
      continue;
    }
    const cue =
      /\b(?:must have|required|preferred|proficien(?:t|cy)|experience (?:with|in)|knowledge of|fluency in|fluent in)\b|wymagan|mile widziane|znajomość/iu.test(
        text,
      );
    if (sectionImportance === null && !cue) continue;
    const negated =
      /\b(?:not required|no .{0,35}required|not necessary|don't need|do not need|without .{0,25}experience)\b|nie (?:jest |są )?wymagan/iu.test(
        text,
      );
    const preferred =
      /\b(?:preferred|nice to have|a plus|a bonus|ideally|desirable)\b|mile widziane/iu.test(text);
    const required = /\b(?:must|required|mandatory|essential)\b|wymagan/iu.test(text);
    const mixed = (preferred && required) || (negated && /\b(?:but|however)\b/i.test(text));
    const importance = mixed
      ? "unspecified"
      : negated
        ? "not_required"
        : preferred
          ? "preferred"
          : required
            ? "required"
            : (sectionImportance ?? "unspecified");
    const skills = skillPatterns
      .filter(
        ([name, pattern]) =>
          pattern.test(text) &&
          !(name === "React" && /\breact (?:to|quickly|appropriately)\b/i.test(text)) &&
          !(name === "Excel" && /\bexcel (?:at|in)\b/i.test(text)),
      )
      .map(([name]) => name);
    const experienceYears: Requirements["statements"][number]["experienceYears"] = [];
    const qualifiedYears = /\b(?:up to|less than|more than|at most|under|over)\s+\d/i.test(text);
    for (const years of text.matchAll(
      /(?<![\d.])(\d{1,2})(?:\s*[-–]\s*(\d{1,2}))?\s*(\+)?\s*(?:years?|lata?|lat)\b[^.!?\n]{0,60}?(?:experience|doświadczeni\p{L}*)/giu,
    )) {
      if (qualifiedYears || negated) continue;
      const min = Number(years[1]);
      const max = years[2] ? Number(years[2]) : null;
      if (max !== null && max < min) continue;
      experienceYears.push({ min, max, text: years[0] });
    }
    const languages = languagePatterns
      .filter(([, pattern]) => pattern.test(text))
      .map(([name]) => ({ name, cefr: null as string | null }));
    // Assign a CEFR level only when there is one language and one explicit level.
    // "Fluent" is not automatically C1/C2, and multi-language lists stay unresolved.
    const levels = [...text.matchAll(/\b[ABC][12]\b/g)].map((level) => level[0]);
    if (languages.length === 1 && levels.length === 1) languages[0]!.cefr = levels[0]!;
    const conditions: Requirements["statements"][number]["conditions"] = [];
    if (/\b(?:degree|bachelor|master|phd|ph\.d)\b|wykształcenie/iu.test(text))
      conditions.push("education");
    if (
      /\b(?:work (?:authorization|permit)|right to work|authorized to work|visa sponsorship)\b/i.test(
        text,
      )
    )
      conditions.push("work_authorization");
    if (/\b(?:security clearance|classified (?:government )?information)\b/i.test(text))
      conditions.push("security_clearance");
    if (/\btravel\b|podróż/iu.test(text)) conditions.push("travel");
    if (/\b(?:weekends?|night shifts?|shift work|working hours)\b/i.test(text))
      conditions.push("schedule");
    const alternative = /\b(?:or|equivalent|either|unless|if)\b|lub|albo/iu.test(text);
    const start = match.index + raw.indexOf(text);
    statements.push({
      importance,
      section,
      evidence: { text, start, end: start + text.length },
      skills,
      experienceYears,
      languages,
      conditions,
      needsReview:
        qualifiedYears ||
        mixed ||
        negated ||
        alternative ||
        importance === "unspecified" ||
        (languages.length > 1 && levels.length > 0) ||
        (!skills.length && !experienceYears.length && !languages.length && !conditions.length),
    });
  }
  return RequirementsSchema.parse({
    version: 1,
    method: "rules",
    coverage: statements.length ? "partial" : "none",
    statements,
    warnings: [
      "Rule-based partial extraction; absence is not proof that a requirement does not exist.",
      "Alternatives and experience scopes must be read in their original statements; do not sum years or require every alternative.",
    ],
  });
}
