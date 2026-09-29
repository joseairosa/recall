import { describe, it, expect } from "vitest";
import { flattenUnionSchema } from "./schema-utils.js";

describe("flattenUnionSchema", () => {
  it("should flatten anyOf discriminated union into type:object", () => {
    const input = {
      anyOf: [
        {
          type: "object",
          properties: {
            action: { type: "string", const: "foo" },
            x: { type: "string", description: "The x value" },
          },
          required: ["action", "x"],
          additionalProperties: false,
        },
        {
          type: "object",
          properties: {
            action: { type: "string", const: "bar" },
            y: { type: "number", description: "The y value" },
          },
          required: ["action", "y"],
          additionalProperties: false,
        },
      ],
      $schema: "http://json-schema.org/draft-07/schema#",
    };

    const result = flattenUnionSchema(input);

    expect(result.type).toBe("object");
    expect(result.anyOf).toBeUndefined();
    expect(result.$schema).toBe("http://json-schema.org/draft-07/schema#");

    const props = result.properties as Record<string, Record<string, unknown>>;
    expect(props.action.type).toBe("string");
    expect(props.action.enum).toEqual(["foo", "bar"]);
    expect(props.x.type).toBe("string");
    expect(props.x.description).toBe("The x value");
    expect(props.y.type).toBe("number");
    expect(props.y.description).toBe("The y value");

    // Only 'action' is required (x and y are variant-specific)
    expect(result.required).toContain("action");
    expect(result.required).not.toContain("x");
    expect(result.required).not.toContain("y");
  });

  it("should flatten oneOf discriminated union", () => {
    const input = {
      oneOf: [
        {
          type: "object",
          properties: {
            action: { type: "string", const: "a" },
          },
          required: ["action"],
        },
        {
          type: "object",
          properties: {
            action: { type: "string", const: "b" },
          },
          required: ["action"],
        },
      ],
    };

    const result = flattenUnionSchema(input);
    expect(result.type).toBe("object");
    const props = result.properties as Record<string, Record<string, unknown>>;
    expect(props.action.enum).toEqual(["a", "b"]);
  });

  it("should pass through non-union schemas unchanged", () => {
    const input = {
      type: "object",
      properties: { name: { type: "string" } },
      required: ["name"],
    };

    const result = flattenUnionSchema(input);
    expect(result).toEqual(input);
  });

  it("should mark shared properties as required", () => {
    const input = {
      anyOf: [
        {
          type: "object",
          properties: {
            action: { type: "string", const: "a" },
            shared: { type: "string" },
          },
          required: ["action", "shared"],
        },
        {
          type: "object",
          properties: {
            action: { type: "string", const: "b" },
            shared: { type: "string" },
          },
          required: ["action", "shared"],
        },
      ],
    };

    const result = flattenUnionSchema(input);
    expect(result.required).toContain("action");
    expect(result.required).toContain("shared");
  });

  it("should support custom discriminator name", () => {
    const input = {
      anyOf: [
        {
          type: "object",
          properties: {
            type: { type: "string", const: "dog" },
            bark: { type: "boolean" },
          },
          required: ["type"],
        },
        {
          type: "object",
          properties: {
            type: { type: "string", const: "cat" },
            meow: { type: "boolean" },
          },
          required: ["type"],
        },
      ],
    };

    const result = flattenUnionSchema(input, { discriminator: "type" });
    const props = result.properties as Record<string, Record<string, unknown>>;
    expect(props.type.enum).toEqual(["dog", "cat"]);
    expect(props.bark).toBeDefined();
    expect(props.meow).toBeDefined();
  });

  it("should preserve first property definition on conflict", () => {
    const input = {
      anyOf: [
        {
          type: "object",
          properties: {
            action: { type: "string", const: "a" },
            limit: {
              type: "number",
              description: "First definition",
              minimum: 1,
            },
          },
          required: ["action"],
        },
        {
          type: "object",
          properties: {
            action: { type: "string", const: "b" },
            limit: {
              type: "number",
              description: "Second definition",
              maximum: 100,
            },
          },
          required: ["action"],
        },
      ],
    };

    const result = flattenUnionSchema(input);
    const props = result.properties as Record<string, Record<string, unknown>>;
    expect(props.limit.description).toBe("First definition");
  });
});
