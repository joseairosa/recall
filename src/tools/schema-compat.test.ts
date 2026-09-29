/**
 * Regression test: all tool inputSchemas must have "type": "object" at root.
 *
 * MCP clients (Claude Code, Cursor, etc.) silently reject tools whose
 * inputSchema lacks "type": "object". This test catches discriminated union
 * schemas that produce bare anyOf/oneOf before they ship.
 */
import { describe, it, expect } from "vitest";
import { memory_graph } from "./memory-graph-tool.js";
import { memory_template } from "./memory-template-tool.js";
import { memory_category } from "./memory-category-tool.js";
import { rlm_process } from "./rlm-process-tool.js";
import { workflow } from "./workflow-tool.js";
import { memory_maintain } from "./memory-maintain-tool.js";

const toolsUnderTest = {
  memory_graph,
  memory_template,
  memory_category,
  rlm_process,
  workflow,
  memory_maintain,
};

describe("MCP schema compatibility", () => {
  it.each(Object.entries(toolsUnderTest))(
    '%s inputSchema has "type": "object" at root',
    (_name, tool) => {
      const schema = tool.inputSchema as Record<string, unknown>;

      // Must have type: "object"
      expect(schema.type).toBe("object");

      // Must NOT have bare anyOf/oneOf at root
      expect(schema.anyOf).toBeUndefined();
      expect(schema.oneOf).toBeUndefined();

      // Must have properties with an action field
      const props = schema.properties as Record<string, unknown>;
      expect(props).toBeDefined();
      expect(props.action).toBeDefined();

      // action must list valid enum values
      const action = props.action as Record<string, unknown>;
      expect(action.type).toBe("string");
      expect(Array.isArray(action.enum)).toBe(true);
      expect((action.enum as string[]).length).toBeGreaterThan(0);

      // action must be required
      const required = schema.required as string[];
      expect(required).toContain("action");
    },
  );
});
