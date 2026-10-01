import { z } from "zod";
export const DescriptionReviewsSchema = z.array(
  z.object({
    jobId: z.string(),
    contentHash: z.string(),
    description: z.string().min(1),
    sourceUrl: z.string().url(),
    checkedAt: z.string(),
  }),
);
export function reviewedDescription(
  job: { id: string; contentHash: string | null; description: string },
  reviews: z.infer<typeof DescriptionReviewsSchema>,
) {
  const review = reviews.find(
    (value) => value.jobId === job.id && value.contentHash === job.contentHash,
  );
  return {
    description: review?.description ?? job.description,
    descriptionReview: review ? { sourceUrl: review.sourceUrl, checkedAt: review.checkedAt } : null,
  };
}
