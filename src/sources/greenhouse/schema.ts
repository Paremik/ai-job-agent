import { z } from "zod";

export const GreenhouseJobSchema = z.object({
  id: z.number(),
  title: z.string().min(1),

  location: z
    .object({
      name: z.string(),
    })
    .nullable()
    .optional(),

  absolute_url: z.string().url(),

  content: z.string().optional(),

  updated_at: z.string().optional(),

  internal_job_id: z.number().nullable().optional(),

  language: z.string().optional(),
});

export const GreenhouseJobsResponseSchema = z.object({
  jobs: z.array(z.unknown()),

  meta: z
    .object({
      total: z.number().optional(),
    })
    .optional(),
});

export type GreenhouseJob = z.infer<typeof GreenhouseJobSchema>;
