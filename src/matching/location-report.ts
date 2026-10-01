import { z } from "zod";
import type { CandidateProfile } from "../domain/candidate-profile.js";
import { evaluateLocation, WorkLocationSchema, type WorkLocation } from "./location-filter.js";
import { extractLocation } from "./extract-location.js";

export const LocationReviewsSchema = z
  .array(
    z.object({
      jobId: z.string().uuid(),
      contentHash: z.string().min(1),
      homeCity: z.string().min(1),
      homeCountry: z.string().regex(/^[A-Z]{2}$/),
      evidence: z.string().trim().min(1),
      location: WorkLocationSchema,
    }),
  )
  .superRefine((reviews, context) => {
    if (new Set(reviews.map((review) => review.jobId)).size !== reviews.length) {
      context.addIssue({ code: "custom", message: "Duplicate job reviews" });
    }
  });

export type SavedLocationJob = {
  id: string;
  title: string;
  company: string;
  location: string | null;
  workplaceType: WorkLocation["workplaceType"];
  canonicalUrl: string;
  contentHash: string | null;
  description?: string;
};

const explanations: Record<string, string> = {
  DISCUSS_HYBRID_WITH_EMPLOYER:
    "Самостоятельно обсудить с работодателем город, частоту посещения офиса, график и дорогу. 2 часа — ориентир, не причина автоматического отказа.",
  REMOTE_NOT_ACCEPTED: "Удалённая работа не выбрана в профиле.",
  REMOTE_LOCATION_RESTRICTED:
    "Работодатель не разрешает удалённую работу из вашего места проживания.",
  CONFIRM_REMOTE_COUNTRY_ELIGIBILITY:
    "Уточнить, разрешена ли удалённая работа из Польши; отметка remote этого не подтверждает.",
  REMOTE_FROM_HOME_ALLOWED: "Подтверждена возможность удалённой работы из вашего места проживания.",
  OFFICE_IN_HOME_CITY: "Офис находится в вашем городе.",
  OFFICE_NOT_ACCEPTED: "Офисный формат не выбран в профиле.",
  DAILY_OFFICE_OUTSIDE_HOME_CITY: "Ежедневный офис находится за пределами вашего города.",
  CONFIRM_OFFICE_LOCATION: "Уточнить город, страну и обязательный офисный формат.",
  HYBRID_IN_HOME_CITY: "Гибридная работа в вашем городе.",
  CONFIRM_ONE_WAY_COMMUTE: "Уточнить гибридный формат и время дороги в одну сторону.",
  HYBRID_COMMUTE_WITHIN_LIMIT: "Подтверждённое время дороги не превышает лимит профиля.",
  HYBRID_COMMUTE_EXCEEDS_LIMIT: "Подтверждённое время дороги превышает лимит профиля.",
  CONFIRM_WORKPLACE_TYPE: "Уточнить формат работы: офис, гибрид или удалённо.",
  REVIEW_OUTDATED: "Подтверждение устарело: изменилось объявление или место проживания.",
  DESCRIPTION_CONFLICT:
    "Описание содержит дополнительные или противоречивые условия; требуется проверка.",
};

export function buildLocationReport(
  profile: CandidateProfile,
  jobs: SavedLocationJob[],
  inputReviews: unknown = [],
) {
  const reviews = new Map(
    LocationReviewsSchema.parse(inputReviews).map((review) => [review.jobId, review]),
  );
  const counts = { eligible: 0, ineligible: 0, needs_review: 0 };
  const rows = jobs.map((job) => {
    const review = reviews.get(job.id);
    const current =
      review &&
      job.contentHash !== null &&
      review.contentHash === job.contentHash &&
      review.homeCity === profile.preferences.homeCity &&
      review.homeCountry === profile.preferences.homeCountry;
    const extraction = extractLocation(job.description ?? "", profile.preferences.homeCountry);
    const extracted = extraction.location.workplaceType !== "unknown";
    const decision =
      review && !current
        ? { status: "needs_review" as const, reason: "REVIEW_OUTDATED" }
        : !current && extraction.issues.length
          ? { status: "needs_review" as const, reason: "DESCRIPTION_CONFLICT" }
          : evaluateLocation(
              profile,
              current
                ? review.location
                : extracted
                  ? extraction.location
                  : {
                      workplaceType: job.workplaceType,
                      city: null,
                      country: null,
                      oneWayCommuteMinutes: null,
                      remoteAllowedFromHome: null,
                    },
            );
    // Even a restrictive profile must not reject a heuristic remote mode.
    const safeDecision =
      !review && !extracted && decision.status !== "needs_review"
        ? { status: "needs_review" as const, reason: "CONFIRM_WORKPLACE_TYPE" }
        : decision;
    counts[safeDecision.status] += 1;
    // Keep full descriptions out of the report; retain the supporting sentences.
    const { description: _description, ...metadata } = job;
    void _description;
    return {
      ...metadata,
      ...safeDecision,
      explanation:
        (!review && extracted ? "По описанию: " : "") +
        (explanations[safeDecision.reason] ?? safeDecision.reason),
      evidence: current ? review.evidence : null,
      extraction,
      decisionSource: current
        ? "manual_review"
        : review
          ? "outdated_review"
          : extracted
            ? "description_rules"
            : "needs_confirmation",
    };
  });
  return { scope: "location_only" as const, total: rows.length, counts, rows };
}

export function renderLocationReport(report: ReturnType<typeof buildLocationReport>): string {
  const clean = (value: string) => value.replace(/[\r\n|]/g, " ").replace(/[<>]/g, "");
  const labels = {
    eligible: "Подходит по месту работы",
    ineligible: "Не подходит по месту работы",
    needs_review: "Нужно уточнить",
  };
  return [
    "# Отчёт по месту работы",
    "",
    "Это проверка только места и формата работы. Навыки, право на работу, график и актуальность вакансий требуют отдельной проверки.",
    "Все сохранённые вакансии остаются в базе. Персональный профиль в отчёт не включён.",
    "",
    `Всего: ${report.total}. Подходит: ${report.counts.eligible}. Не подходит: ${report.counts.ineligible}. Уточнить: ${report.counts.needs_review}.`,
    "",
    ...Object.entries(labels).flatMap(([status, label]) => [
      `## ${label}`,
      "",
      "Компания | Вакансия | Место из объявления | Причина | Основание | ID",
      "--- | --- | --- | --- | --- | ---",
      ...report.rows
        .filter((row) => row.status === status)
        .map((row) =>
          [
            row.company,
            row.title,
            row.location ?? "Не указано",
            row.explanation,
            row.evidence ??
              row.extraction.evidence
                .map((item) => item.quote)
                .filter((quote, index, all) => all.indexOf(quote) === index)
                .join("; "),
            row.id,
          ]
            .map(clean)
            .join(" | "),
        ),
      "",
    ]),
    "Полные ссылки и данные для проверки находятся в location-report.json.",
    "",
  ].join("\n");
}
