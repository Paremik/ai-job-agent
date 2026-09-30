import { z } from "zod";

// Public Posting API object shapes: https://developers.smartrecruiters.com/docs/objects
const SmartRecruitersCompanySchema = z
  .object({
    identifier: z.string().min(1).optional(),
    name: z.string().min(1).optional(),
  })
  .optional();

const SmartRecruitersLocationSchema = z
  .object({
    city: z.string().nullable().optional(),
    region: z.string().nullable().optional(),
    country: z.string().nullable().optional(),
    remote: z.boolean().optional(),
  })
  .nullable()
  .optional();

export const SmartRecruitersPostingSchema = z.object({
  id: z.string().min(1),
  uuid: z.string().min(1).optional(),
  name: z.string().min(1),
  company: SmartRecruitersCompanySchema,
  location: SmartRecruitersLocationSchema,
  ref: z.string().url().optional(),
});

export const SmartRecruitersPostingsResponseSchema = z.object({
  limit: z.number().int().nonnegative(),
  offset: z.number().int().nonnegative(),
  totalFound: z.number().int().nonnegative(),
  content: z.array(z.unknown()),
});

export const SmartRecruitersPostingDetailsSchema = z.object({
  id: z.string().min(1),
  uuid: z.string().min(1).optional(),
  name: z.string().min(1),
  company: SmartRecruitersCompanySchema,
  location: SmartRecruitersLocationSchema,
  typeOfEmployment: z.object({ label: z.string().optional() }).optional(),
  postingUrl: z.string().url().optional(),
  applyUrl: z.string().url().optional(),
  jobAd: z
    .object({
      sections: z
        .record(
          z.string(),
          z
            .object({
              title: z.string().optional(),
              text: z.string().optional(),
              urls: z.array(z.string().url()).optional(),
            })
            .passthrough(),
        )
        .optional(),
    })
    .optional(),
  active: z.boolean().optional(),
});

export type SmartRecruitersPosting = z.infer<typeof SmartRecruitersPostingSchema>;
export type SmartRecruitersPostingDetails = z.infer<typeof SmartRecruitersPostingDetailsSchema>;
