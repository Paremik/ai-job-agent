import { z } from "zod";

const nonempty = z.string().trim().min(1);
export const CandidateProfileSchema = z
  .object({
    version: z.literal(1),
    displayName: nonempty,
    evidence: z.array(
      z.object({
        id: nonempty,
        kind: z.enum(["cv", "certificate", "github", "user_statement"]),
        reference: nonempty,
      }),
    ),
    facts: z.array(
      z.object({
        id: nonempty,
        category: z.enum([
          "skill",
          "project",
          "language",
          "education",
          "experience",
          "certificate",
        ]),
        statement: nonempty,
        evidenceIds: z.array(nonempty).min(1),
        // Documented use in a project is not proof of independent proficiency.
        basis: z.enum(["documented", "user_confirmed"]),
        // Explicit evidence tags, not skills inferred from arbitrary prose.
        skillUses: z.array(nonempty).optional(),
        languageLevels: z
          .array(
            z.object({
              name: nonempty,
              cefr: z.enum(["A1", "A2", "B1", "B2", "C1", "C2"]),
            }),
          )
          .optional(),
      }),
    ),
    preferences: z.object({
      searchScope: z.literal("entry_level_it_broad"),
      homeCity: nonempty,
      homeCountry: z.string().regex(/^[A-Z]{2}$/),
      onsiteInHomeCity: z.boolean(),
      hybridMaxOneWayMinutes: z.number().int().nonnegative(),
      hybridCommutePolicy: z
        .enum(["employer_discussion", "time_limit"])
        .default("employer_discussion"),
      remoteAllowed: z.boolean(),
      salary: z.literal("negotiable"),
      schedule: z.literal("negotiable"),
      availableFrom: z.string().date().nullable(),
      workAuthorization: z.string().nullable(),
      evidenceIds: z.array(nonempty).min(1),
    }),
    unresolved: z.array(nonempty),
  })
  .superRefine((profile, ctx) => {
    const evidenceIds = new Set(profile.evidence.map((item) => item.id));
    for (const fact of profile.facts) {
      if (fact.skillUses?.length && !["skill", "project"].includes(fact.category)) {
        ctx.addIssue({ code: "custom", message: "Skill use tags require a skill or project fact" });
      }
      if (fact.languageLevels?.length && fact.category !== "language") {
        ctx.addIssue({ code: "custom", message: "Language levels require a language fact" });
      }
    }
    if (
      evidenceIds.size !== profile.evidence.length ||
      new Set(profile.facts.map((fact) => fact.id)).size !== profile.facts.length
    ) {
      ctx.addIssue({ code: "custom", message: "Evidence and fact IDs must be unique" });
    }
    const references = [
      ...profile.facts.flatMap((fact) => fact.evidenceIds),
      ...profile.preferences.evidenceIds,
    ];
    if (references.some((id) => !evidenceIds.has(id))) {
      ctx.addIssue({
        code: "custom",
        message: "Every fact and preference must reference existing evidence",
      });
    }
  });

export type CandidateProfile = z.infer<typeof CandidateProfileSchema>;
