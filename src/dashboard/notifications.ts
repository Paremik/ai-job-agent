import { createHash } from "node:crypto";
import { z } from "zod";
import { possibleDuplicateKey } from "../matching/duplicate-groups.js";
import { buildDashboardData } from "./view-model.js";
import { scheduledActions, type ReviewStore } from "./review-store.js";

export const NotificationStore = z.object({
  version: z.literal(1),
  knownUrls: z.array(z.string()),
  pendingUrls: z.array(z.string()),
  acknowledged: z.array(z.string()),
});
export type NotificationStore = z.infer<typeof NotificationStore>;
export const NotificationRequest = z.object({
  acknowledge: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
});

const key = (...parts: string[]) =>
  createHash("sha256").update(JSON.stringify(parts)).digest("hex");

export function syncNotifications(
  previous: NotificationStore | null,
  report: unknown,
  reviews: ReviewStore,
  today: string,
  acknowledge?: string,
) {
  const { rows, generatedAt } = buildDashboardData(report, []);
  const known = new Set(previous?.knownUrls ?? rows.map((row) => row.url));
  const pending = new Set(previous?.pendingUrls ?? []);
  const acknowledged = new Set(previous?.acknowledged ?? []);
  const records = new Map(reviews.records.map((record) => [record.url, record]));
  const relevant = (row: (typeof rows)[number]) =>
    row.firstLook && (row.locationStatus === "eligible" || /\bOpole\b/iu.test(row.location));
  for (const row of rows) {
    if (!known.has(row.url) && relevant(row)) pending.add(row.url);
    known.add(row.url);
  }
  const notifications = scheduledActions(reviews)
    .filter((record) => record.nextActionDate! <= today)
    .map((record) => ({
      id: key("action", record.url, record.nextActionDate!),
      kind: "action",
      url: record.url,
      title: record.title,
      company: record.company,
      reason: `Пора выполнить запланированное действие: ${record.nextActionDate}`,
    }));
  const notifiedGroups = new Set<string>();
  for (const row of rows) {
    const record = records.get(row.url);
    if (pending.has(row.url) && relevant(row) && !record?.status && !record?.sentAt) {
      const group = row.location === "Место не указано" ? null : possibleDuplicateKey(row);
      if (group && notifiedGroups.has(group)) continue;
      if (group) notifiedGroups.add(group);
      notifications.push({
        id: group ? key("job-group", group) : key("job", row.url),
        kind: "job",
        url: row.url,
        title: row.title,
        company: row.company,
        reason:
          row.status === "review_now"
            ? "Новая в локальном отчёте · Можно рассмотреть сейчас. Проверь исходное объявление."
            : "Новая в локальном отчёте · Junior или стажировка для первого просмотра. Уточни условия и требования.",
      });
    }
  }
  if (acknowledge && notifications.some((item) => item.id === acknowledge)) {
    acknowledged.add(acknowledge);
  }
  return {
    store: NotificationStore.parse({
      version: 1,
      knownUrls: [...known],
      pendingUrls: [...pending],
      acknowledged: [...acknowledged],
    }),
    notifications: notifications.filter(
      (item) =>
        !acknowledged.has(item.id) &&
        (item.kind !== "job" || !acknowledged.has(key("job", item.url))),
    ),
    generatedAt,
  };
}
