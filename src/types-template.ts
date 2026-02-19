import { z } from "zod";
import { ContextType } from "./types-core.js";

export const MemoryTemplateSchema = z.object({
  template_id: z.string().describe("Template identifier (ULID)"),
  name: z.string().describe("Template name"),
  description: z.string().optional().describe("Template description"),
  context_type: ContextType,
  content_template: z
    .string()
    .describe("Template content with {{placeholders}}"),
  default_tags: z.array(z.string()).default([]),
  default_importance: z.number().min(1).max(10).default(5),
  is_builtin: z
    .boolean()
    .default(false)
    .describe("Built-in template (cannot be deleted)"),
  created_at: z.string().describe("ISO 8601 timestamp"),
});

export type MemoryTemplate = z.infer<typeof MemoryTemplateSchema>;

export const CreateFromTemplateSchema = z.object({
  template_id: z.string().describe("Template ID to use"),
  variables: z
    .record(z.string())
    .describe("Variables to fill in template (key-value pairs)"),
  tags: z
    .array(z.string())
    .optional()
    .describe("Additional tags (merged with template defaults)"),
  importance: z
    .number()
    .min(1)
    .max(10)
    .optional()
    .describe("Override template importance"),
  is_global: z.boolean().default(false).describe("Create as global memory"),
});

export type CreateFromTemplate = z.infer<typeof CreateFromTemplateSchema>;

export const CreateTemplateSchema = z.object({
  name: z.string().min(1).describe("Template name"),
  description: z.string().optional().describe("Template description"),
  context_type: ContextType.default("information"),
  content_template: z
    .string()
    .min(1)
    .describe("Template content with {{placeholders}}"),
  default_tags: z.array(z.string()).default([]),
  default_importance: z.number().min(1).max(10).default(5),
});

export type CreateTemplate = z.infer<typeof CreateTemplateSchema>;

export const SetMemoryCategorySchema = z.object({
  memory_id: z.string().describe("Memory ID"),
  category: z.string().describe("Category name"),
});

export type SetMemoryCategory = z.infer<typeof SetMemoryCategorySchema>;

export const ListCategoriesSchema = z.object({
  include_counts: z
    .boolean()
    .default(true)
    .describe("Include memory counts per category"),
});

export type ListCategories = z.infer<typeof ListCategoriesSchema>;

export interface CategoryInfo {
  category: string;
  memory_count?: number;
  created_at: string;
  last_used: string;
}
