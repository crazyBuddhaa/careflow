import { z } from 'zod';
import { KnowledgeStatus } from '@careflow/shared';

export const KnowledgeStatusSchema = z.nativeEnum(KnowledgeStatus);

export const CreateKnowledgeCategorySchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Category name must be at least 2 characters.')
    .max(80, 'Category name must be at most 80 characters.'),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      'Category slug must contain lowercase letters, numbers, and hyphens only.'
    )
    .max(80)
    .optional(),
  description: z
    .string()
    .trim()
    .max(300, 'Category description must be at most 300 characters.')
    .default(''),
  displayOrder: z.number().int().min(0).max(9999).default(0),
});

export const UpdateKnowledgeCategorySchema = CreateKnowledgeCategorySchema.partial().refine(
  (data) => Object.keys(data).length > 0,
  { message: 'At least one category field must be provided for update.' }
);

export const CreateKnowledgeArticleSchema = z.object({
  title: z
    .string()
    .trim()
    .min(3, 'Article title must be at least 3 characters.')
    .max(160, 'Article title must be at most 160 characters.'),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      'Article slug must contain lowercase letters, numbers, and hyphens only.'
    )
    .max(160)
    .optional(),
  shortDescription: z
    .string()
    .trim()
    .min(5, 'Short description must be at least 5 characters.')
    .max(400, 'Short description must be at most 400 characters.'),
  content: z
    .string()
    .trim()
    .min(10, 'Main article content must be at least 10 characters.')
    .max(50000, 'Main article content exceeds maximum allowed length.'),
  categoryId: z.string().trim().min(1).nullable().default(null),
  tags: z
    .array(z.string().trim().min(1).max(40))
    .max(15, 'A maximum of 15 tags is supported per article.')
    .default([]),
  status: KnowledgeStatusSchema.default(KnowledgeStatus.Draft),
});

export const UpdateKnowledgeArticleSchema = CreateKnowledgeArticleSchema.partial().refine(
  (data) => Object.keys(data).length > 0,
  { message: 'At least one article field must be provided for update.' }
);

export const CreateKnowledgeFaqSchema = z.object({
  question: z
    .string()
    .trim()
    .min(5, 'FAQ question must be at least 5 characters.')
    .max(240, 'FAQ question must be at most 240 characters.'),
  answer: z
    .string()
    .trim()
    .min(5, 'Approved answer must be at least 5 characters.')
    .max(10000, 'Approved answer exceeds maximum allowed length.'),
  categoryId: z.string().trim().min(1).nullable().default(null),
  status: KnowledgeStatusSchema.default(KnowledgeStatus.Draft),
  displayOrder: z.number().int().min(0).max(9999).default(0),
});

export const UpdateKnowledgeFaqSchema = CreateKnowledgeFaqSchema.partial().refine(
  (data) => Object.keys(data).length > 0,
  { message: 'At least one FAQ field must be provided for update.' }
);

export const KnowledgeListFilterSchema = z.object({
  search: z.string().trim().max(120).optional(),
  categoryId: z.string().trim().min(1).optional(),
  status: KnowledgeStatusSchema.optional(),
});

export const DevAdminSessionSignInSchema = z.object({
  organizationId: z.string().trim().min(2, 'Workspace identifier is required.').max(120),
  accessPasscode: z.string().min(1, 'Workspace access passcode is required.'),
});

export type CreateKnowledgeCategoryInput = z.infer<typeof CreateKnowledgeCategorySchema>;
export type UpdateKnowledgeCategoryInput = z.infer<typeof UpdateKnowledgeCategorySchema>;
export type CreateKnowledgeArticleInput = z.infer<typeof CreateKnowledgeArticleSchema>;
export type UpdateKnowledgeArticleInput = z.infer<typeof UpdateKnowledgeArticleSchema>;
export type CreateKnowledgeFaqInput = z.infer<typeof CreateKnowledgeFaqSchema>;
export type UpdateKnowledgeFaqInput = z.infer<typeof UpdateKnowledgeFaqSchema>;
export type KnowledgeListFilterInput = z.infer<typeof KnowledgeListFilterSchema>;
export type DevAdminSessionSignInInput = z.infer<typeof DevAdminSessionSignInSchema>;
