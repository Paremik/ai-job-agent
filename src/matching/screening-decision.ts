import type { jobPriority } from "./job-priority.js";

type Priority = ReturnType<typeof jobPriority>;
type Location = {
  status: "eligible" | "ineligible" | "needs_review";
  decisionSource: string;
};

// Triage is for ordering human review. It never authorizes an application.
export function screeningDecision(
  priority: Priority,
  location?: Location,
  sourceCheck?: { entryLevelListed: boolean } | null,
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
  if (reasons.length) {
    return {
      status: "defer" as const,
      reasons: roleReason ? [...reasons, roleReason] : reasons,
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
    status: "review_now" as const,
    reasons: [
      "Начальный уровень и подтверждённые условия позволяют проверить вакансию первой.",
      ...(roleReason ? [roleReason] : []),
    ],
    applicationAllowed: false as const,
  };
}
