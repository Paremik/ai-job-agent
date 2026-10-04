import type { jobPriority } from "./job-priority.js";

type Priority = ReturnType<typeof jobPriority>;
type Location = {
  status: "eligible" | "ineligible" | "needs_review";
  decisionSource: string;
  reason?: string;
};
type ReviewContext = {
  homeCity: string;
  locationText: string | null;
  workplaceType: "remote" | "hybrid" | "onsite" | "unknown";
  hasRelatedSkills: boolean;
};

// Triage is for ordering human review. It never authorizes an application.
export function screeningDecision(
  priority: Priority,
  location?: Location,
  sourceCheck?: { entryLevelListed: boolean } | null,
  context?: ReviewContext,
) {
  const reasons: string[] = [];
  const targetRoleReason = priority.signals?.targetRole;
  const targetRoleLabel =
    targetRoleReason === "development"
      ? "разработка"
      : targetRoleReason === "testing"
        ? "тестирование"
        : targetRoleReason === "support"
          ? "IT-поддержка"
          : null;
  const roleReason = targetRoleLabel
    ? `Название указывает на направление поиска «${targetRoleLabel}»; проверь фактические обязанности.`
    : null;
  if (location?.status === "ineligible" && location.decisionSource === "manual_review") {
    reasons.push("Подтверждённое человеком место работы не соответствует предпочтениям.");
  }
  if (priority.tier === "experienced") {
    reasons.push("Старший уровень или обязательный стаж 3+ года снижает приоритет первой работы.");
  }
  if (
    targetRoleReason === "other_or_unclear" &&
    priority.titleLevel !== "entry" &&
    !context?.hasRelatedSkills &&
    !priority.signals?.requiredMatches.length &&
    !priority.signals?.preferredMatches.length
  ) {
    reasons.push(
      "В названии и требованиях нет признаков выбранного IT-направления или подтверждённых навыков; вакансия остаётся доступной для поиска.",
    );
  }
  if (reasons.length) {
    return {
      status: "defer" as const,
      reasons: roleReason ? [...reasons, roleReason] : reasons,
      applicationAllowed: false as const,
    };
  }

  const localListing =
    context?.locationText?.trim().toLocaleLowerCase() === context?.homeCity.toLocaleLowerCase() &&
    context?.workplaceType !== "remote" &&
    location?.reason === "CONFIRM_WORKPLACE_TYPE";
  const locationWorthReviewing = location?.status === "eligible" || localListing;
  const entryEvidence = priority.titleLevel === "entry" || sourceCheck?.entryLevelListed === true;
  if (
    locationWorthReviewing &&
    entryEvidence &&
    !priority.intermediateTitle &&
    priority.largestExplicitMinimumYears === null &&
    priority.signals &&
    priority.signals.targetRole !== "other_or_unclear" &&
    !priority.signals.languageGap &&
    !priority.signals.languageReview &&
    priority.signals.requiredMissing.length === 0
  ) {
    return {
      status: "review_now" as const,
      reasons: [
        "Начальная роль в выбранном IT-направлении заслуживает ранней ручной проверки.",
        ...(location?.status === "eligible"
          ? []
          : ["Город совпадает с местом проживания; формат работы нужно проверить в объявлении."]),
        ...(priority.signals.incomplete
          ? ["Описание неполное: перед откликом проверь все обязательные требования."]
          : []),
        ...(roleReason ? [roleReason] : []),
      ],
      applicationAllowed: false as const,
    };
  }

  if (!location || location.status !== "eligible") {
    reasons.push("Место или формат работы требуют уточнения.");
  }
  if (priority.tier !== "entry" || priority.titleLevel !== "entry") {
    reasons.push(
      sourceCheck?.entryLevelListed
        ? "Первоисточник перечисляет junior, но требования для этого уровня нужно уточнить."
        : "Начальный уровень роли не подтверждён без дополнительных вопросов.",
    );
  }
  if (!priority.signals || priority.signals.incomplete) {
    reasons.push("Полные обязательные требования не подтверждены.");
  }
  if (priority.signals?.languageGap || priority.signals?.languageReview) {
    reasons.push("Языковые требования нужно обсудить с работодателем.");
  }
  if (priority.signals?.requiredMissing.length) {
    reasons.push("Для части обязательных навыков нет подтверждения в профиле.");
  }
  if (reasons.length) {
    if (roleReason) reasons.push(roleReason);
    return { status: "clarify_first" as const, reasons, applicationAllowed: false as const };
  }
  return {
    status: "clarify_first" as const,
    reasons: [
      "Перед повышением приоритета проверь направление, уровень и условия.",
      ...(roleReason ? [roleReason] : []),
    ],
    applicationAllowed: false as const,
  };
}
