/**
 * memory_template — consolidated tool replacing:
 *   create_template, create_from_template, list_templates
 */

import { zodToJsonSchema } from "zod-to-json-schema";
import { MemoryStore } from "../persistence/memory-store.js";
import { MemoryTemplateActionSchema } from "../types.js";

let _store: MemoryStore | null = null;

export function setMemoryTemplateStore(store: MemoryStore): void {
  _store = store;
}

function getStore(): MemoryStore {
  if (!_store) throw new Error("memory_template store not initialized");
  return _store;
}

function ok(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}
function err(msg: string) {
  return { content: [{ type: "text" as const, text: msg }], isError: true };
}

export const memory_template = {
  description:
    "Manage memory templates. " +
    "Actions: create (new template with placeholders), use (create memory from template), " +
    "list (show all available templates).",
  inputSchema: zodToJsonSchema(MemoryTemplateActionSchema),
  handler: async (args: unknown) => {
    try {
      const store = getStore();
      const parsed = MemoryTemplateActionSchema.parse(args);

      switch (parsed.action) {
        case "create": {
          const template = await store.createTemplate({
            name: parsed.name,
            description: parsed.description,
            context_type: parsed.context_type,
            content_template: parsed.content_template,
            default_tags: parsed.default_tags,
            default_importance: parsed.default_importance,
          });
          return ok({ success: true, template });
        }
        case "use": {
          const memory = await store.createFromTemplate(
            parsed.template_id,
            parsed.variables,
            parsed.tags,
            parsed.importance,
            parsed.is_global,
          );
          return ok({ success: true, memory, template_id: parsed.template_id });
        }
        case "list": {
          const templates = await store.getAllTemplates();
          return ok({
            success: true,
            templates,
            total: templates.length,
            builtin_count: templates.filter((t) => t.is_builtin).length,
            workspace_count: templates.filter((t) => !t.is_builtin).length,
          });
        }
      }
    } catch (e) {
      return err(e instanceof Error ? e.message : String(e));
    }
  },
};
