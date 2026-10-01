import { readFile } from "node:fs/promises";
import { CandidateProfileSchema } from "../src/domain/candidate-profile.js";

try {
  const raw: unknown = JSON.parse(
    await readFile(new URL("../private/candidate-profile.json", import.meta.url), "utf8"),
  );
  const result = CandidateProfileSchema.safeParse(raw);
  if (!result.success) {
    console.error(
      "Candidate profile is invalid. Check required fields and evidence references; personal values are not printed.",
    );
    process.exitCode = 1;
  } else {
    console.log("Candidate profile OK.");
    console.log(
      `Facts: ${result.data.facts.length}; evidence sources: ${result.data.evidence.length}; unresolved: ${result.data.unresolved.length}.`,
    );
    console.log(
      `Hybrid commute reference: ${result.data.preferences.hybridMaxOneWayMinutes} minutes one way.`,
    );
  }
} catch {
  console.error(
    "Cannot read private/candidate-profile.json. Create it from config/candidate-profile.example.json and check its JSON syntax.",
  );
  process.exitCode = 1;
}
