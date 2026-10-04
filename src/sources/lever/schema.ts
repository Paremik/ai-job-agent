import { z } from "zod";

// Public Postings API: https://github.com/lever/postings-api#get-a-list-of-job-postings
export const LeverJobSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),

  categories: z
    .object({
      location: z.string().nullable().optional(),
      allLocations: z.array(z.string()).optional(),
    })
    .nullable()
    .optional(),

  hostedUrl: z.string().url(),

  description: z.string().optional(),
  descriptionPlain: z.string().optional(),

  lists: z
    .array(
      z.object({
        text: z.string(),
        content: z.string(),
      }),
    )
    .optional(),

  additional: z.string().optional(),
  additionalPlain: z.string().optional(),

  workplaceType: z.string().optional(),
  country: z.string().nullable().optional(),

  salaryRange: z
    .object({
      currency: z.string(),
      interval: z.string(),
      min: z.number(),
      max: z.number(),
    })
    .optional(),

  salaryDescription: z.string().optional(),
  salaryDescriptionPlain: z.string().optional(),
});

// Validate postings individually so a malformed job does not reject the page.
export const LeverJobsResponseSchema = z.array(z.unknown());

export type LeverJob = z.infer<typeof LeverJobSchema>;
