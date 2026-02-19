import { z } from "zod";
import { MemoryEntry } from "./types-core.js";

export enum RelationshipType {
  RELATES_TO = "relates_to",
  PARENT_OF = "parent_of",
  CHILD_OF = "child_of",
  REFERENCES = "references",
  SUPERSEDES = "supersedes",
  IMPLEMENTS = "implements",
  EXAMPLE_OF = "example_of",
}

export const MemoryRelationshipSchema = z.object({
  id: z.string().describe("Unique relationship identifier (ULID)"),
  from_memory_id: z.string().describe("Source memory ID"),
  to_memory_id: z.string().describe("Target memory ID"),
  relationship_type: z
    .nativeEnum(RelationshipType)
    .describe("Type of relationship"),
  created_at: z.string().describe("ISO 8601 timestamp"),
  metadata: z.record(z.unknown()).optional().describe("Optional metadata"),
});

export type MemoryRelationship = z.infer<typeof MemoryRelationshipSchema>;

export const LinkMemoriesSchema = z.object({
  from_memory_id: z.string().describe("Source memory ID"),
  to_memory_id: z.string().describe("Target memory ID"),
  relationship_type: z
    .nativeEnum(RelationshipType)
    .describe("Type of relationship"),
  metadata: z.record(z.unknown()).optional().describe("Optional metadata"),
});

export type LinkMemories = z.infer<typeof LinkMemoriesSchema>;

export const GetRelatedMemoriesSchema = z.object({
  memory_id: z.string().describe("Memory ID to get relationships for"),
  relationship_types: z
    .array(z.nativeEnum(RelationshipType))
    .optional()
    .describe("Filter by relationship types"),
  depth: z.number().min(1).max(5).default(1).describe("Traversal depth (1-5)"),
  direction: z
    .enum(["outgoing", "incoming", "both"])
    .default("both")
    .describe("Relationship direction"),
});

export type GetRelatedMemories = z.infer<typeof GetRelatedMemoriesSchema>;

export const UnlinkMemoriesSchema = z.object({
  relationship_id: z.string().describe("Relationship ID to remove"),
});

export type UnlinkMemories = z.infer<typeof UnlinkMemoriesSchema>;

export const GetMemoryGraphSchema = z.object({
  memory_id: z.string().describe("Root memory ID for graph"),
  max_depth: z
    .number()
    .min(1)
    .max(3)
    .default(2)
    .describe("Maximum graph depth"),
  max_nodes: z
    .number()
    .min(1)
    .max(100)
    .default(50)
    .describe("Maximum nodes to return"),
});

export type GetMemoryGraph = z.infer<typeof GetMemoryGraphSchema>;

export interface RelatedMemoryResult {
  memory: MemoryEntry;
  relationship: MemoryRelationship;
  depth: number;
}

export interface MemoryGraphNode {
  memory: MemoryEntry;
  relationships: MemoryRelationship[];
  depth: number;
}

export interface MemoryGraph {
  root_memory_id: string;
  nodes: Record<string, MemoryGraphNode>;
  total_nodes: number;
  max_depth_reached: number;
}
