import type { CandidateProfile } from "../domain/candidate-profile.js";
import type { compareRequirements } from "./compare-requirements.js";

export function prioritySignals(
  title: string,
  description: string,
  profile: CandidateProfile,
  comparison: ReturnType<typeof compareRequirements>,
) {
  const requiredMatches = new Set<string>();
  const requiredMissing = new Set<string>();
  const preferredMatches = new Set<string>();
  const reasons: string[] = [];
  let languageReview = false;
  let languageGap = false;
  for (const { requirement, findings, ignored } of comparison.statements) {
    if (ignored) continue;
    for (const finding of findings) {
      if (finding.kind === "skill" && !requirement.needsReview) {
        if (requirement.importance === "required") {
          if (finding.status === "related_evidence") requiredMatches.add(finding.label);
          if (finding.status === "no_evidence") requiredMissing.add(finding.label);
        }
        if (requirement.importance === "preferred" && finding.status === "related_evidence")
          preferredMatches.add(finding.label);
      }
      if (finding.kind === "language" && requirement.importance !== "preferred") {
        if (finding.status === "declared_level_below") languageGap = true;
        if (finding.status === "needs_review") languageReview = true;
      }
    }
  }
  // A title may reveal a language omitted by a truncated description. Do not infer CEFR.
  for (const [language, pattern] of [
    ["German", /\bgerman\b|niemieck\p{L}*/iu],
    ["English", /\benglish\b|angielsk\p{L}*/iu],
    ["Polish", /\bpolish\b|polsk\p{L}*/iu],
  ] as const) {
    if (
      pattern.test(title) &&
      !profile.facts.some((fact) =>
        fact.languageLevels?.some((level) => level.name.toLowerCase() === language.toLowerCase()),
      )
    ) {
      languageReview = true;
      reasons.push(
        `В названии указан ${language}, в профиле язык не заявлен; уточнить требование.`,
      );
    }
  }
  const snippet = /\[Jooble search snippet|\[RSS summary/i.test(description);
  const hasRequired = comparison.statements.some(
    ({ requirement, ignored }) => !ignored && requirement.importance === "required",
  );
  const incomplete = snippet || !hasRequired;
  if (incomplete)
    reasons.push(
      snippet
        ? "Доступен только фрагмент: до оценки получить полные требования."
        : "Обязательные требования не распознаны; полнота описания и разбора не подтверждена.",
    );
  else
    reasons.push("Разбор требований частичный; отсутствие отметки не подтверждает соответствие.");
  if (languageGap) reasons.push("Заявленный уровень языка ниже распознанного требования.");
  if (languageReview)
    reasons.push("Языковые условия требуют проверки; отсутствие уровня не означает соответствие.");
  if (requiredMissing.size)
    reasons.push(`Обязательные навыки без подтверждения: ${[...requiredMissing].join(", ")}.`);
  return {
    requiredMatches: [...requiredMatches].sort(),
    requiredMissing: [...requiredMissing].sort(),
    preferredMatches: [...preferredMatches].sort(),
    incomplete,
    languageGap,
    languageReview,
    reasons,
    needsReview: incomplete || languageGap || languageReview || requiredMissing.size > 0,
  };
}
