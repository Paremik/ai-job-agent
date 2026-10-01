import type { CandidateProfile } from "../domain/candidate-profile.js";
import type { Requirements } from "./extract-requirements.js";

type Finding = {
  kind: "skill" | "language" | "experience" | "condition" | "statement";
  label: string;
  status:
    | "related_evidence"
    | "no_evidence"
    | "needs_review"
    | "declared_level_meets"
    | "declared_level_below";
  explanation: string;
  factIds: string[];
  evidenceIds: string[];
};
const cefr = ["A1", "A2", "B1", "B2", "C1", "C2"];
const key = (value: string) => value.trim().toLowerCase();

export function compareRequirements(profile: CandidateProfile, requirements: Requirements) {
  const matchedSkills = new Set<string>();
  const missingSkills = new Set<string>();
  const statements = requirements.statements.map((requirement) => {
    const findings: Finding[] = [];
    const refs = (facts: CandidateProfile["facts"]) => ({
      factIds: facts.map((fact) => fact.id),
      evidenceIds: [...new Set(facts.flatMap((fact) => fact.evidenceIds))],
    });
    if (requirement.importance === "not_required") return { requirement, ignored: true, findings };
    for (const skill of requirement.skills) {
      const facts = profile.facts.filter((fact) =>
        fact.skillUses?.some((use) => key(use) === key(skill)),
      );
      // An overlap is supporting project evidence, never proof of required seniority.
      if (facts.length) matchedSkills.add(skill);
      else missingSkills.add(skill);
      findings.push({
        kind: "skill",
        label: skill,
        status: requirement.needsReview
          ? "needs_review"
          : facts.length
            ? "related_evidence"
            : "no_evidence",
        explanation: facts.length
          ? "Есть подтверждение использования в проекте; уровень владения и коммерческий опыт не установлены."
          : "В профиле нет подтверждения этого навыка. Это не означает, что кандидат им не владеет.",
        ...refs(facts),
      });
    }
    for (const language of requirement.languages) {
      const facts = profile.facts.filter((fact) =>
        fact.languageLevels?.some((level) => key(level.name) === key(language.name)),
      );
      const levels = [
        ...new Set(
          facts.flatMap(
            (fact) =>
              fact.languageLevels
                ?.filter((level) => key(level.name) === key(language.name))
                .map((level) => level.cefr) ?? [],
          ),
        ),
      ];
      const required = language.cefr === null ? -1 : cefr.indexOf(language.cefr);
      const declared = levels.length === 1 ? cefr.indexOf(levels[0]!) : -1;
      const comparable = !requirement.needsReview && required >= 0 && declared >= 0;
      findings.push({
        kind: "language",
        label: language.name,
        status: comparable
          ? declared >= required
            ? "declared_level_meets"
            : "declared_level_below"
          : "needs_review",
        explanation: comparable
          ? `В CV указан ${levels[0]}, в требовании ${language.cefr}. Уровень из CV не проверен независимо.`
          : "Нужно уточнить язык/уровень или формулировку требования; fluent не переводится автоматически в CEFR.",
        ...refs(facts),
      });
    }
    for (const years of requirement.experienceYears) {
      findings.push({
        kind: "experience",
        label: years.text,
        status: "needs_review",
        explanation:
          "Подтверждённых сроков и задач коммерческого опыта нет. Проекты и стажировки не пересчитываются автоматически в годы.",
        ...refs(profile.facts.filter((fact) => fact.category === "experience")),
      });
    }
    for (const condition of requirement.conditions) {
      findings.push({
        kind: "condition",
        label: condition,
        status: "needs_review",
        explanation:
          "Условие требует отдельной проверки; наличие записи в CV не подтверждает его выполнение.",
        ...refs(
          profile.facts.filter(
            (fact) => condition === "education" && fact.category === "education",
          ),
        ),
      });
    }
    if (!findings.length || requirement.needsReview)
      findings.push({
        kind: "statement",
        label: requirement.evidence.text,
        status: "needs_review",
        explanation:
          "Проверить фразу целиком: возможны альтернативы, условия или нераспознанные требования.",
        factIds: [],
        evidenceIds: [],
      });
    return { requirement, ignored: false, findings };
  });
  return {
    version: 1 as const,
    // This is an inspection order signal, not a percentage of job suitability.
    matchedSkills: [...matchedSkills].sort(),
    skillsWithoutEvidence: [...missingSkills].sort(),
    reviewRequired: true as const,
    statements,
  };
}
