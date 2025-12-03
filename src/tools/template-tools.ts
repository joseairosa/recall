import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { MemoryStore } from '../persistence/memory-store.js';
import {
  CreateTemplateSchema,
  CreateFromTemplateSchema,
} from '../types.js';

const memoryStore = await MemoryStore.create();

export const templateTools = {
  create_template: {
    description: 'Create a new memory template with placeholders',
    inputSchema: zodToJsonSchema(CreateTemplateSchema),
    handler: async (args: z.infer<typeof CreateTemplateSchema>) => {
      try {
        const template = await memoryStore.createTemplate(args);

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              success: true,
              template: {
                template_id: template.template_id,
                name: template.name,
                description: template.description,
                context_type: template.context_type,
                content_template: template.content_template,
                default_tags: template.default_tags,
                default_importance: template.default_importance,
                created_at: template.created_at,
              },
              message: `Successfully created template "${template.name}"`,
            }, null, 2),
          }],
        };
      } catch (error) {
        if (error instanceof McpError) throw error;
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new McpError(ErrorCode.InternalError, `Failed to create template: ${errorMessage}`);
      }
    },
  },

  create_from_template: {
    description: 'Create a new memory from a template by filling in variables',
    inputSchema: zodToJsonSchema(CreateFromTemplateSchema),
    handler: async (args: z.infer<typeof CreateFromTemplateSchema>) => {
      try {
        const memory = await memoryStore.createFromTemplate(
          args.template_id,
          args.variables,
          args.tags,
          args.importance,
          args.is_global
        );

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              success: true,
              memory: {
                id: memory.id,
                content: memory.content,
                context_type: memory.context_type,
                importance: memory.importance,
                tags: memory.tags,
                summary: memory.summary,
                category: memory.category,
                is_global: memory.is_global,
              },
              template_id: args.template_id,
              message: 'Successfully created memory from template',
            }, null, 2),
          }],
        };
      } catch (error) {
        if (error instanceof McpError) throw error;
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new McpError(ErrorCode.InternalError, `Failed to create from template: ${errorMessage}`);
      }
    },
  },

  list_templates: {
    description: 'List all available memory templates (workspace + builtin)',
    inputSchema: zodToJsonSchema(z.object({})),
    handler: async () => {
      try {
        const templates = await memoryStore.getAllTemplates();

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              success: true,
              templates: templates.map(t => ({
                template_id: t.template_id,
                name: t.name,
                description: t.description,
                context_type: t.context_type,
                content_template: t.content_template,
                default_tags: t.default_tags,
                default_importance: t.default_importance,
                is_builtin: t.is_builtin,
                created_at: t.created_at,
              })),
              total: templates.length,
              builtin_count: templates.filter(t => t.is_builtin).length,
              workspace_count: templates.filter(t => !t.is_builtin).length,
            }, null, 2),
          }],
        };
      } catch (error) {
        if (error instanceof McpError) throw error;
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new McpError(ErrorCode.InternalError, `Failed to list templates: ${errorMessage}`);
      }
    },
  },
};
