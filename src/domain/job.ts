import { z } from "zod";

export const WorkplaceTypeSchema = z.enum(["remote", "hybrid", "onsite", "unknown"]);

export const JobSchema = z.object({
  id: z.string().min(1),
  externalId: z.string().min(1),
  source: z.string().min(1),

  company: z.string().min(1),
  title: z.string().min(1),
  description: z.string(),

  location: z.string().nullable(),

  workplaceType: WorkplaceTypeSchema,

  salaryMin: z.number().nullable(),
  salaryMax: z.number().nullable(),
  salaryCurrency: z.string().nullable(),

  sourceUrl: z.string().url(),
  canonicalUrl: z.string().url(),

  discoveredAt: z.string().datetime(),
});

export type Job = z.infer<typeof JobSchema>;

export type WorkplaceType = z.infer<typeof WorkplaceTypeSchema>;
