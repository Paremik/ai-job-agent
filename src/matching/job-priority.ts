import type { Requirements } from "./extract-requirements.js";
import type { prioritySignals } from "./priority-signals.js";

export function jobPriority(
  title: string,
  requirements: Requirements,
  locationStatus: string,
  signals?: ReturnType<typeof prioritySignals>,
) {
  const entry =
    /\b(?:junior|jr\.?|intern|internship|trainee|graduate|entry[- ]level|apprentice)\b|młodszy|młodsza|stażysta|stażystka/iu.test(
      title,
    );
  // "Front desk staff" and "Lead generation" are not senior engineering levels.
  const advanced =
    /\b(?:senior|sr\.?|principal)\b|\bstaff\+?\s+(?:software |platform |security |research )?(?:engineer|developer|scientist)\b|\b(?:lead|chief)\s+(?:software |technical |security )?(?:engineer|developer|architect|scientist|officer)\b|\b(?:director|head of|vice president|vp|team lead|engineering manager)\b/iu.test(
      title,
    );
  const intermediate = /\b(?:mid|middle|regular)\b/iu.test(title);
  const years = requirements.statements
    .filter((statement) => statement.importance === "required" && !statement.needsReview)
    .flatMap((statement) =>
      statement.experienceYears.map((value) => ({
        min: value.min,
        quote: statement.evidence.text,
      })),
    );
  const largestMinimum = years.length ? Math.max(...years.map((value) => value.min)) : null;
  const reasons: string[] = [];
  if (entry && advanced)
    reasons.push("Название содержит начальный и старший уровни; уточнить доступный уровень.");
  else if (advanced) reasons.push("Название указывает на старший или руководящий уровень.");
  else if (entry) reasons.push("Название указывает на стажировку или начальный уровень.");
  else reasons.push("Уровень по названию не определён; это не означает, что роль начальная.");
  if (largestMinimum !== null)
    reasons.push(
      `Распознано обязательное требование от ${largestMinimum} лет опыта; сроки кандидата не подтверждены.`,
    );
  const experienced = (advanced && !entry) || (largestMinimum !== null && largestMinimum >= 3);
  let tier: "entry" | "review" | "experienced" | "location_mismatch" = experienced
    ? "experienced"
    : entry && !advanced
      ? "entry"
      : "review";
  if (largestMinimum !== null && largestMinimum >= 3)
    reasons.push(
      "Порог 3+ года снижает приоритет для поиска первой работы; это не автоматический отказ.",
    );
  if (entry && intermediate) {
    if (tier === "entry") tier = "review";
    reasons.push("Junior/Mid: начальный уровень не гарантирован; уточнить опыт.");
  }
  if (largestMinimum !== null && largestMinimum > 0 && tier === "entry") {
    tier = "review";
    reasons.push("Обязательный стаж требует подтверждения до повышения приоритета.");
  }
  if (signals) {
    reasons.push(...signals.reasons);
    if (signals.needsReview && tier === "entry") tier = "review";
  }
  if (locationStatus === "ineligible") {
    tier = "location_mismatch";
    reasons.push("Есть несовместимость по месту работы; вакансия сохранена в конце списка.");
  } else if (locationStatus !== "eligible")
    reasons.push("Место и формат работы ещё требуют уточнения.");
  return {
    version: 2 as const,
    signals,
    tier,
    order: { entry: 0, review: 1, experienced: 2, location_mismatch: 3 }[tier],
    titleLevel: entry && advanced ? "mixed" : advanced ? "advanced" : entry ? "entry" : "unknown",
    largestExplicitMinimumYears: largestMinimum,
    experienceEvidence: years,
    reasons,
  };
}

export function compareJobPriority(
  a: {
    id: string;
    priority: ReturnType<typeof jobPriority>;
    comparison: { matchedSkills: string[] };
  },
  b: {
    id: string;
    priority: ReturnType<typeof jobPriority>;
    comparison: { matchedSkills: string[] };
  },
) {
  return (
    a.priority.order - b.priority.order ||
    Number(a.priority.titleLevel !== "entry") - Number(b.priority.titleLevel !== "entry") ||
    Number(a.priority.signals?.languageGap ?? false) -
      Number(b.priority.signals?.languageGap ?? false) ||
    Number(a.priority.signals?.incomplete ?? false) -
      Number(b.priority.signals?.incomplete ?? false) ||
    Number(a.priority.signals?.languageReview ?? false) -
      Number(b.priority.signals?.languageReview ?? false) ||
    (a.priority.signals?.requiredMissing.length ?? 0) -
      (b.priority.signals?.requiredMissing.length ?? 0) ||
    (b.priority.signals?.requiredMatches.length ?? 0) -
      (a.priority.signals?.requiredMatches.length ?? 0) ||
    (b.priority.signals?.preferredMatches.length ?? 0) -
      (a.priority.signals?.preferredMatches.length ?? 0) ||
    Number(a.priority.signals?.targetRole === "other_or_unclear") -
      Number(b.priority.signals?.targetRole === "other_or_unclear") ||
    a.id.localeCompare(b.id)
  );
}
