import { z } from "zod";
import type { buildApplicationBrief } from "./application-brief.js";

type Brief = ReturnType<typeof buildApplicationBrief>["brief"];

export const ApplicantContact = z.object({
  email: z.email(),
  phone: z.string().trim().min(5).max(50),
  github: z.url().refine((value) => new URL(value).protocol === "https:"),
});
export type ApplicantContact = z.infer<typeof ApplicantContact>;

export const LocalDraft = z.object({
  version: z.literal(1),
  jobId: z.uuid(),
  jobUrl: z.url(),
  company: z.string(),
  role: z.string(),
  profileHash: z.string(),
  contentHash: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  cvText: z.string().min(1).max(30_000),
  letterText: z.string().min(1).max(30_000),
  reviewNotes: z.array(z.string()),
});
export type LocalDraft = z.infer<typeof LocalDraft>;

export const DraftUpdate = z.object({
  jobId: z.uuid(),
  cvText: z.string().trim().min(1).max(30_000),
  letterText: z.string().trim().min(1).max(30_000),
});

const clean = (value: string, limit = 300) => value.replace(/\s+/g, " ").trim().slice(0, limit);

const projects = [
  {
    id: "agent",
    name: "AI Job Application Agent",
    stack: "TypeScript, Node.js, Zod, PostgreSQL, Vitest",
    description: "Adaptery źródeł ofert, walidacja danych, zapis w bazie i testy aplikacji.",
    letterSentence:
      "Rozwijam adaptery pobierające oferty, sprawdzam poprawność danych, zapisuję je w bazie i testuję zachowanie aplikacji.",
    url: "https://github.com/Paremik/ai-job-agent",
  },
  {
    id: "bot",
    name: "Telegram Apartment Bot Opole",
    stack: "Python, aiogram, aiohttp, SQLite",
    description: "Bot do przeglądania i filtrowania ofert mieszkań z zapisem danych.",
    letterSentence: "Bot pobiera i filtruje oferty mieszkań, a następnie zapisuje dane w SQLite.",
    url: "https://github.com/Paremik/telegram-apartment-bot-opole",
  },
  {
    id: "audio",
    name: "AudioViz",
    stack: "Python, NumPy, Pillow, FFmpeg",
    description: "Projekt generowania wideo z wizualizacją dźwięku.",
    letterSentence: "Projekt przetwarza dane dźwiękowe i generuje wideo z ich wizualizacją.",
    url: "https://github.com/Paremik/AudioViz",
  },
  {
    id: "map",
    name: "Camera Map",
    stack: "React, Next.js, TypeScript, MapLibre GL",
    description: "Interaktywna mapa kamer i stref dronowych w Opolu.",
    letterSentence: "Aplikacja pokazuje na interaktywnej mapie kamery i strefy dronowe w Opolu.",
    url: "https://github.com/Paremik/camera-map",
  },
  {
    id: "cafe",
    name: "Niebieski Kot",
    stack: "React, Vite, Tailwind CSS",
    description: "Koncepcyjna, wielojęzyczna aplikacja demonstracyjna kawiarni.",
    letterSentence:
      "Projekt przedstawia wielojęzyczny interfejs demonstracyjnej aplikacji kawiarni.",
    url: "https://github.com/Paremik/Niebieski_Kot",
  },
] as const;

function projectOrder(role: string) {
  const title = role.toLowerCase();
  if (/front|web|react|ui|ux/.test(title)) return ["map", "cafe", "agent", "bot", "audio"];
  if (/test|qa|quality/.test(title)) return ["agent", "bot", "audio", "map", "cafe"];
  if (/python|backend|data/.test(title)) return ["bot", "agent", "audio", "map", "cafe"];
  return ["agent", "bot", "map", "cafe", "audio"];
}

function focus(role: string) {
  const title = role.toLowerCase();
  if (/front|web|react|ui|ux/.test(title))
    return "Interesuje mnie tworzenie czytelnych interfejsów i rozwijanie aplikacji webowych.";
  if (/test|qa|quality/.test(title))
    return "Chcę rozwijać się w testowaniu funkcjonalnym i stopniowo poszerzać umiejętności automatyzacji.";
  if (/python|backend|data/.test(title))
    return "Chcę rozwijać się w pracy z Pythonem, danymi i aplikacjami backendowymi.";
  if (/build|release|devops/.test(title))
    return "Interesuje mnie diagnozowanie problemów oraz utrzymanie narzędzi wspierających pracę zespołu.";
  return "Szukam pierwszej roli IT, w której wykorzystam projekty własne i doświadczenie z praktyk.";
}

export function buildLocalDraft(brief: Brief, contact: ApplicantContact, now: string): LocalDraft {
  const facts = new Map(brief.candidate.facts.map((fact) => [fact.id, fact]));
  const order = projectOrder(brief.job.title);
  const available = order
    .map((id) => projects.find((project) => project.id === id))
    .filter((project): project is (typeof projects)[number] =>
      Boolean(project && facts.has(project.id)),
    );
  const languages = facts.get("languages");
  const languageNames: Record<string, string> = {
    Polish: "Polski",
    English: "Angielski",
    Ukrainian: "Ukraiński",
    Russian: "Rosyjski",
  };
  const languageText = languages?.languageLevels?.length
    ? `${languages.languageLevels.map((item) => `${languageNames[item.name] ?? item.name} ${item.cefr}`).join(" | ")} (poziomy deklarowane w CV).`
    : "Poziomy językowe do uzupełnienia po sprawdzeniu CV.";
  const skills = [
    ...(facts.has("agent")
      ? ["- TypeScript, Node.js, Zod, PostgreSQL i Vitest w AI Job Application Agent."]
      : []),
    ...(facts.has("bot") ? ["- Python, aiogram, aiohttp i SQLite w projekcie bota Telegram."] : []),
    ...(facts.has("map") ? ["- React i TypeScript w Camera Map."] : []),
    ...(facts.has("cafe") ? ["- React i JavaScript w Niebieski Kot."] : []),
    ...(facts.has("internships")
      ? ["- Testy manualne, poprawianie błędów i konfiguracja środowiska podczas praktyk IT."]
      : []),
  ];
  const skillSummary = [
    facts.has("agent") ? "TypeScriptu" : null,
    facts.has("bot") ? "Pythona" : null,
  ]
    .filter(Boolean)
    .join(" i ");
  const availableFrom = brief.candidate.preferences.availableFrom;
  const availableText = availableFrom
    ? availableFrom <= now.slice(0, 10)
      ? "Mogę rozpocząć współpracę od zaraz"
      : `Mogę rozpocząć współpracę od ${availableFrom}`
    : "Termin rozpoczęcia wymaga uzgodnienia";
  const practice = facts.has("internships")
    ? "Segal, Opole — praktyki IT, 05.2024–06.2025 i 05.2026–06.2026. Testy manualne, poprawianie błędów, refaktoryzacja i porządkowanie kodu oraz konfiguracja środowiska. Diagnozowanie problemów Windows, montaż komputerów i podłączanie sprzętu u klientów. Praktyki szkolne, nie pełnoetatowe zatrudnienie programistyczne."
    : "Praktyki i doświadczenie do uzupełnienia na podstawie potwierdzonych dokumentów.";
  const intro = [
    facts.has("education")
      ? "Uczę się na kierunku Technik Programista w Opolu."
      : "Rozwijam umiejętności w projektach IT.",
    focus(brief.job.title),
    skillSummary ? `W projektach własnych korzystam z ${skillSummary}.` : "",
    facts.has("internships")
      ? "Podczas praktyk wykonywałem zadania programistyczne i testy manualne."
      : "",
  ]
    .filter(Boolean)
    .join(" ");
  const projectLines = available.flatMap((project) => [
    `${project.name} | ${project.stack}`,
    project.description,
    project.url,
    "",
  ]);
  const cvText = [
    brief.candidate.displayName,
    `Kandydat na stanowisko ${clean(brief.job.title, 120)} — ${clean(brief.job.company, 100)}`,
    `${brief.candidate.preferences.homeCity} | ${contact.phone} | ${contact.email} | ${contact.github}`,
    "",
    "PROFIL",
    intro,
    "",
    "UMIEJĘTNOŚCI W PROJEKTACH I PRAKTYKACH",
    ...skills,
    "",
    "PROJEKTY",
    ...projectLines,
    "PRAKTYKI ZAWODOWE",
    practice,
    "",
    "WYKSZTAŁCENIE I JĘZYKI",
    facts.has("education")
      ? "ZSTiO im. Kazimierza Gzowskiego w Opolu — Technik Programista, 09.2021–obecnie (nauka w toku)."
      : "Wykształcenie do uzupełnienia po sprawdzeniu dokumentów.",
    facts.has("react-course") ? "React od podstaw — Strefa Kursów, certyfikat 16.03.2026." : "",
    languageText,
    `${availableText}; godziny i tryb pracy do uzgodnienia${facts.has("education") ? " z uwzględnieniem nauki" : ""}.`,
  ]
    .filter((line, index, lines) => line !== "" || lines[index - 1] !== "")
    .join("\n")
    .trim();
  const examples = available.slice(0, 2);
  const first = examples[0];
  const second = examples[1];
  const letterText = [
    `Temat: Aplikacja — ${clean(brief.job.title, 120)} | ${brief.candidate.displayName}`,
    "",
    "Dzień dobry,",
    "",
    `nazywam się ${brief.candidate.displayName} i chciałbym zgłosić kandydaturę na stanowisko ${clean(brief.job.title, 120)} w ${clean(brief.job.company, 100)}. ${facts.has("education") ? "Uczę się na kierunku Technik Programista w Opolu." : "Rozwijam własne projekty IT."} ${focus(brief.job.title)}`,
    "",
    first
      ? `W projekcie ${first.name} używam technologii ${first.stack}. ${first.letterSentence} Kod jest dostępny tutaj: ${first.url}. Dzięki temu mogę pokazać konkretne rozwiązania i sposób, w jaki pracuję z aplikacją oraz danymi.`
      : "Rozwijam własne projekty programistyczne, które chętnie przedstawię podczas rozmowy.",
    "",
    second
      ? `Drugim przykładem jest ${second.name}. ${second.letterSentence} Wykorzystuję w nim ${second.stack}. Repozytorium: ${second.url}. Praca nad różnymi projektami pozwala mi poznawać kolejne narzędzia i analizować problemy na różnych etapach działania programu.`
      : "",
    "",
    facts.has("internships")
      ? "Podczas praktyk IT w Segal wykonywałem testy manualne, poprawiałem błędy, porządkowałem i refaktoryzowałem kod oraz konfigurowałem środowisko. Diagnozowałem również problemy Windows i pomagałem przy podłączaniu sprzętu u klientów."
      : "",
    "",
    `Moje dotychczasowe doświadczenie obejmuje projekty własne${facts.has("internships") ? " i praktyki szkolne" : ""}; nie przedstawiam go jako pełnoetatowego doświadczenia komercyjnego. Chętnie porozmawiam o tym, które wymagania są konieczne od pierwszego dnia, a których mogę nauczyć się w zespole.`,
    "",
    `Mieszkam ${brief.candidate.preferences.homeCity === "Opole" ? "w Opolu" : `w mieście ${clean(brief.candidate.preferences.homeCity, 80)}`}${facts.has("education") ? " i nadal się uczę" : ""}. Czy mogą Państwo potwierdzić tryb pracy dla tej roli${facts.has("education") ? " i możliwość uzgodnienia godzin z planem nauki" : ""}? ${brief.job.location ? `W ogłoszeniu wskazano lokalizację: ${clean(brief.job.location, 100)}.` : "Lokalizacja wymaga potwierdzenia."} ${availableText}.`,
    "",
    "W załączeniu przesyłam CV. Będę wdzięczny za informację, czy rozważają Państwo kandydata z takim profilem. Chętnie opowiem więcej o projektach podczas rozmowy.",
    "",
    "Z poważaniem,",
    brief.candidate.displayName,
    contact.phone,
    contact.email,
    brief.candidate.preferences.homeCity,
  ]
    .filter((line, index, lines) => line !== "" || lines[index - 1] !== "")
    .join("\n")
    .trim();
  const unverifiedRequirements = brief.review.requirements
    .filter((item) => item.importance === "required")
    .flatMap((item) =>
      item.findings
        .filter(
          (finding) =>
            ["no_evidence", "needs_review"].includes(finding.status) &&
            finding.factIds.length === 0,
        )
        .map((finding) => clean(item.text.length <= 120 ? item.text : finding.label, 120))
        .filter((text) => text.length <= 80 && !/^Summary:/i.test(text)),
    );
  const gaps = [
    ...new Set([...brief.review.skillsWithoutEvidence, ...unverifiedRequirements]),
  ].slice(0, 12);
  const reviewNotes = [
    "To lokalny szkic z potwierdzonych danych. Sprawdź oryginalne ogłoszenie i każde zdanie przed użyciem.",
    `Źródło oferty: ${brief.job.url}`,
    `Miejsce/tryb pracy: ${brief.job.locationExplanation}`,
    ...(gaps.length
      ? [`Wymagania do osobistej weryfikacji — brak potwierdzenia w profilu: ${gaps.join("; ")}.`]
      : []),
    ...brief.candidate.unresolved.slice(0, 4),
    "Nic nie zostało wysłane do pracodawcy.",
  ];
  return LocalDraft.parse({
    version: 1,
    jobId: brief.job.id,
    jobUrl: brief.job.url,
    company: brief.job.company,
    role: brief.job.title,
    profileHash: brief.profileHash,
    contentHash: brief.job.contentHash,
    createdAt: now,
    updatedAt: now,
    cvText,
    letterText,
    reviewNotes,
  });
}
