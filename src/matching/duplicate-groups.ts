type RecordWithIdentity = {
  id: string;
  company: string;
  title: string;
  canonicalUrl: string;
  location: string | null;
};
const words = (text: string) =>
  text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}+#]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
export function duplicateKey(row: Pick<RecordWithIdentity, "company" | "title">) {
  const company = words(row.company).replace(/\s+(?:sp z o o|s a|sa)$/u, "");
  const title = words(row.title.replace(/\((?:k\/m|m\/k|f\/m\/x|k\/m\/x)\)/gi, ""));
  return `${company}::${title}`;
}
// Display grouping only: separate offices/requisitions remain visible and are never deleted.
export function groupPossibleDuplicates<T extends RecordWithIdentity>(rows: T[]) {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const key = duplicateKey(row);
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }
  return [...groups.values()].map((members) => ({
    representative: members[0]!,
    members,
    confidence: members.length > 1 ? ("possible_duplicate" as const) : ("single" as const),
    locations: [...new Set(members.map((row) => row.location).filter(Boolean))],
  }));
}
