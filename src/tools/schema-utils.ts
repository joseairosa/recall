/**
 * Utility to flatten JSON Schema discriminated unions (anyOf/oneOf) into a
 * single `"type": "object"` schema.
 *
 * MCP clients like Claude Code require `"type": "object"` at the root of every
 * tool's inputSchema. Zod's `z.discriminatedUnion()` produces `{ anyOf: [...] }`
 * via `zodToJsonSchema()`, which lacks a root `"type"` and causes silent tool
 * registration failures.
 *
 * This function merges all union variants into one flat object schema:
 *   - The discriminator field (e.g. `action`) becomes a required `string` enum
 *   - All variant-specific properties are merged, marked optional
 *   - Property descriptions and constraints are preserved from the first variant
 *     that defines each property
 *
 * Runtime validation still happens via `ZodSchema.parse()` in each tool handler,
 * so no validation accuracy is lost.
 */

type JsonSchema = Record<string, unknown>;

interface FlattenOptions {
  /**
   * Name of the discriminator property (default: "action").
   */
  discriminator?: string;
}

/**
 * Flatten an anyOf/oneOf discriminated union schema into a single object schema.
 *
 * If the input schema already has `"type": "object"`, it is returned as-is.
 */
export function flattenUnionSchema(
  schema: JsonSchema,
  options: FlattenOptions = {},
): JsonSchema {
  const discriminator = options.discriminator ?? "action";

  const variants = (schema.anyOf ?? schema.oneOf) as JsonSchema[] | undefined;
  if (!variants || !Array.isArray(variants)) {
    // Not a union schema — return as-is
    return schema;
  }

  const mergedProperties: Record<string, JsonSchema> = {};
  const actionValues: string[] = [];
  const allRequired = new Set<string>();

  // Track which properties are required across ALL variants
  const requiredPerVariant: Set<string>[] = [];

  for (const variant of variants) {
    const props = (variant.properties ?? {}) as Record<string, JsonSchema>;
    const required = new Set((variant.required as string[]) ?? []);
    requiredPerVariant.push(required);

    for (const [key, prop] of Object.entries(props)) {
      if (key === discriminator) {
        // Collect discriminator values
        const constVal = prop.const as string | undefined;
        const enumVals = prop.enum as string[] | undefined;
        if (constVal) actionValues.push(constVal);
        else if (enumVals) actionValues.push(...enumVals);
        continue;
      }

      // Keep the first definition of each property (preserves descriptions)
      if (!(key in mergedProperties)) {
        // Clone to avoid mutating the original
        mergedProperties[key] = { ...prop };
      }
    }
  }

  // A non-discriminator property is "globally required" only if required
  // in EVERY variant — which is rare for discriminated unions.
  // In practice, only the discriminator itself is universally required.
  if (requiredPerVariant.length > 0) {
    const allPropNames = new Set(Object.keys(mergedProperties));
    for (const propName of allPropNames) {
      if (requiredPerVariant.every((req) => req.has(propName))) {
        allRequired.add(propName);
      }
    }
  }

  const result: JsonSchema = {
    type: "object",
    properties: {
      [discriminator]: {
        type: "string",
        enum: actionValues,
        description: `Action to perform. One of: ${actionValues.join(", ")}`,
      },
      ...mergedProperties,
    },
    required: [discriminator, ...Array.from(allRequired)],
  };

  // Preserve $schema if present
  if (schema.$schema) {
    result.$schema = schema.$schema;
  }

  return result;
}
