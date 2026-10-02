import { z } from "zod";

export const ReviewStatus = z.enum(["planned", "sent", "reply", "rejected", "dismissed"]);

export const ReviewRecord = z.object({
  url: z.url().refine((value) => {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  }),
  title: z.string().trim().min(1).max(180),
  company: z.string().trim().min(1).max(120),
  status: ReviewStatus.nullable(),
  starred: z.boolean(),
  updatedAt: z.iso.datetime(),
  sentAt: z.iso.datetime().nullable(),
  note: z.string().max(2000).default(""),
  nextActionDate: z.iso.date().nullable().default(null),
});

export const ReviewStore = z.object({
  version: z.literal(1),
  records: z.array(ReviewRecord),
});

export const ReviewChange = ReviewRecord.pick({
  url: true,
  title: true,
  company: true,
  status: true,
  starred: true,
}).extend({
  note: z.string().trim().max(2000).optional(),
  nextActionDate: z.iso.date().nullable().optional(),
});

export type ReviewRecord = z.infer<typeof ReviewRecord>;
export type ReviewStore = z.infer<typeof ReviewStore>;

function sevenDaysLater(now: string): string {
  const date = new Date(now);
  date.setDate(date.getDate() + 7);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

export function updateReviewStore(
  store: ReviewStore,
  input: z.infer<typeof ReviewChange>,
  now: string,
): ReviewStore {
  const change = ReviewChange.parse(input);
  const existing = store.records.find((record) => record.url === change.url);
  const submitted = ["sent", "reply", "rejected"].includes(change.status ?? "");
  let nextActionDate =
    change.nextActionDate === undefined
      ? (existing?.nextActionDate ?? null)
      : change.nextActionDate;
  if (
    change.status === "sent" &&
    existing?.status !== "sent" &&
    change.nextActionDate === undefined &&
    !nextActionDate
  ) {
    nextActionDate = sevenDaysLater(now);
  }
  if (change.status === "rejected" || change.status === "dismissed" || change.status === null)
    nextActionDate = null;
  const record = ReviewRecord.parse({
    ...change,
    note: change.note === undefined ? (existing?.note ?? "") : change.note,
    nextActionDate,
    updatedAt: now,
    sentAt: submitted
      ? (existing?.sentAt ?? now)
      : change.status === "dismissed"
        ? (existing?.sentAt ?? null)
        : null,
  });
  return {
    version: 1,
    records: [record, ...store.records.filter((item) => item.url !== record.url)],
  };
}

export function recentApplications(store: ReviewStore): ReviewRecord[] {
  return store.records
    .filter((record) => record.sentAt !== null)
    .sort((left, right) => right.sentAt!.localeCompare(left.sentAt!))
    .slice(0, 200);
}

export function scheduledActions(store: ReviewStore): ReviewRecord[] {
  return store.records
    .filter(
      (record) =>
        record.nextActionDate !== null &&
        ["planned", "sent", "reply"].includes(record.status ?? ""),
    )
    .sort((left, right) => left.nextActionDate!.localeCompare(right.nextActionDate!));
}
