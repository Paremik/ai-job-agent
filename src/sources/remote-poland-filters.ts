const junior =
  /\b(?:junior|jr\.?|intern|internship|trainee|graduate|entry[- ]level)\b|młodszy|młodsza|stażysta|stażystka/iu;
const target =
  /\b(?:software|developer|engineer|tester|testing|qa|support|help\s?desk|administrator|frontend|backend|fullstack)\b|programista/iu;

export function juniorItTitle(title: string): boolean {
  return junior.test(title) && target.test(title);
}

export function polishCountry(value: string | null | undefined): boolean {
  return /^(?:Poland|Polska|PL)$/iu.test(value?.trim() ?? "");
}

export function polishLocation(value: string | null | undefined): boolean {
  return /(?:^|[,/])\s*(?:Poland|Polska|PL)\s*(?:$|[,/])/iu.test(value?.trim() ?? "");
}
