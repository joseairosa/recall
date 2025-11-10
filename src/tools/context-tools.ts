import { z } from 'zod';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { MemoryStore } from '../persistence/memory-store.js';
import { ConversationAnalyzer } from '../analysis/conversation-analyzer.js';
import {
  RecallContextSchema,
  AnalyzeConversationSchema,
  SummarizeSessionSchema,
  GetTimeWindowContextSchema,
  type AnalysisResult,
  type MemoryEntry,
} from '../types.js';

const memoryStore = await MemoryStore.create();
const analyzer = new ConversationAnalyzer();

/**
 * recall_relevant_context - Proactively retrieve relevant memories for current task
 */
export const recall_relevant_context = {
  description: 'Proactively search memory for context relevant to current task. Use this when you need to recall patterns, decisions, or conventions.',
  inputSchema: zodToJsonSchema(RecallContextSchema),
  handler: async (args: z.infer<typeof RecallContextSchema>) => {
    try {
      // Enhance the search query
      const enhancedQuery = await analyzer.enhanceQuery(args.current_task, args.query);

      // Semantic search with filters
      const results = await memoryStore.searchMemories(
        enhancedQuery,
        args.limit,
        args.min_importance
      );

      // Format results for Claude to read
      const formattedResults = results.map(r => ({
        content: r.content,
        summary: r.summary,
        context_type: r.context_type,
        importance: r.importance,
        tags: r.tags,
        similarity: Math.round(r.similarity * 100) / 100,
      }));

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              current_task: args.current_task,
              found: results.length,
              relevant_memories: formattedResults,
            }, null, 2),
          },
        ],
      };
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to recall context: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  },
};

/**
 * analyze_and_remember - Extract structured memories from conversation
 */
export const analyze_and_remember = {
  description: 'Analyze conversation text and automatically extract and store important information (decisions, patterns, directives, etc.). Use this after important discussions.',
  inputSchema: zodToJsonSchema(AnalyzeConversationSchema),
  handler: async (args: z.infer<typeof AnalyzeConversationSchema>) => {
    try {
      // Analyze conversation to extract memories
      const extracted = await analyzer.analyzeConversation(args.conversation_text);

      const result: AnalysisResult = {
        extracted_memories: extracted,
        total_count: extracted.length,
      };

      // Auto-store if requested
      if (args.auto_store && extracted.length > 0) {
        const memories = await memoryStore.createMemories(
          extracted.map(e => ({
            content: e.content,
            context_type: e.context_type,
            importance: e.importance,
            tags: e.tags,
            summary: e.summary,
            is_global: false,
          }))
        );

        result.stored_ids = memories.map(m => m.id);
      }

      // Format response
      const response = {
        success: true,
        analyzed: result.total_count,
        stored: result.stored_ids?.length || 0,
        breakdown: {
          directives: extracted.filter(e => e.context_type === 'directive').length,
          decisions: extracted.filter(e => e.context_type === 'decision').length,
          patterns: extracted.filter(e => e.context_type === 'code_pattern').length,
          requirements: extracted.filter(e => e.context_type === 'requirement').length,
          errors: extracted.filter(e => e.context_type === 'error').length,
          insights: extracted.filter(e => e.context_type === 'insight').length,
          other: extracted.filter(e => !['directive', 'decision', 'code_pattern', 'requirement', 'error', 'insight'].includes(e.context_type)).length,
        },
        memories: extracted.map(e => ({
          content: e.content.substring(0, 100) + (e.content.length > 100 ? '...' : ''),
          type: e.context_type,
          importance: e.importance,
        })),
      };

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(response, null, 2),
          },
        ],
      };
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to analyze conversation: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  },
};

/**
 * summarize_session - Create a session summary and snapshot
 */
export const summarize_session = {
  description: 'Summarize the current work session and create a snapshot. Use this at the end of a work session to preserve context.',
  inputSchema: zodToJsonSchema(SummarizeSessionSchema),
  handler: async (args: z.infer<typeof SummarizeSessionSchema>) => {
    try {
      // Get recent memories from the lookback period
      const lookbackMs = args.lookback_minutes * 60 * 1000;
      const cutoffTime = Date.now() - lookbackMs;

      const allRecent = await memoryStore.getRecentMemories(100);
      const sessionMemories = allRecent.filter(m => m.timestamp >= cutoffTime);

      if (sessionMemories.length === 0) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: false,
                message: 'No memories found in the specified lookback period',
                lookback_minutes: args.lookback_minutes,
              }, null, 2),
            },
          ],
        };
      }

      // Generate summary using Claude
      const summary = await analyzer.summarizeSession(
        sessionMemories.map(m => ({
          content: m.content,
          context_type: m.context_type,
          importance: m.importance,
        }))
      );

      let sessionInfo = null;

      // Create session snapshot if requested
      if (args.auto_create_snapshot) {
        const sessionName = args.session_name || `Session ${new Date().toISOString().split('T')[0]}`;
        sessionInfo = await memoryStore.createSession(
          sessionName,
          sessionMemories.map(m => m.id),
          summary
        );
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              success: true,
              summary,
              session_id: sessionInfo?.session_id,
              session_name: sessionInfo?.session_name,
              memory_count: sessionMemories.length,
              lookback_minutes: args.lookback_minutes,
              breakdown: {
                directives: sessionMemories.filter(m => m.context_type === 'directive').length,
                decisions: sessionMemories.filter(m => m.context_type === 'decision').length,
                patterns: sessionMemories.filter(m => m.context_type === 'code_pattern').length,
                insights: sessionMemories.filter(m => m.context_type === 'insight').length,
              },
            }, null, 2),
          },
        ],
      };
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to summarize session: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  },
};

// Helper function to convert Zod schema to JSON Schema (same as in tools/index.ts)
function zodToJsonSchema(schema: z.ZodType): any {
  if (schema instanceof z.ZodObject) {
    const shape = schema._def.shape();
    const properties: any = {};
    const required: string[] = [];

    for (const [key, value] of Object.entries(shape)) {
      properties[key] = zodToJsonSchemaInner(value as z.ZodType);
      if (!(value as any).isOptional()) {
        required.push(key);
      }
    }

    return {
      type: 'object',
      properties,
      required,
    };
  }

  return zodToJsonSchemaInner(schema);
}

function zodToJsonSchemaInner(schema: z.ZodType): any {
  if (schema instanceof z.ZodString) {
    const result: any = { type: 'string' };
    if (schema.description) result.description = schema.description;
    return result;
  }

  if (schema instanceof z.ZodNumber) {
    const result: any = { type: 'number' };
    if (schema.description) result.description = schema.description;
    return result;
  }

  if (schema instanceof z.ZodBoolean) {
    const result: any = { type: 'boolean' };
    if (schema.description) result.description = schema.description;
    return result;
  }

  if (schema instanceof z.ZodArray) {
    const result: any = {
      type: 'array',
      items: zodToJsonSchemaInner(schema.element),
    };
    if (schema.description) result.description = schema.description;
    return result;
  }

  if (schema instanceof z.ZodEnum) {
    const result: any = {
      type: 'string',
      enum: schema.options,
    };
    if (schema.description) result.description = schema.description;
    return result;
  }

  if (schema instanceof z.ZodOptional) {
    return zodToJsonSchemaInner(schema.unwrap());
  }

  if (schema instanceof z.ZodDefault) {
    const inner = zodToJsonSchemaInner(schema._def.innerType);
    inner.default = schema._def.defaultValue();
    return inner;
  }

  if (schema instanceof z.ZodObject) {
    return zodToJsonSchema(schema);
  }

  return { type: 'string' };
}

/**
 * get_time_window_context - Get all memories from a specific time window
 */
export const get_time_window_context = {
  description: 'Get all memories from a specific time window and build consolidated context output. Perfect for retrieving "everything from the last 2 hours" or specific time ranges.',
  inputSchema: zodToJsonSchema(GetTimeWindowContextSchema),
  handler: async (args: z.infer<typeof GetTimeWindowContextSchema>) => {
    try {
      // Calculate time window
      let startTime: number;
      let endTime: number;

      if (args.start_timestamp && args.end_timestamp) {
        // Explicit time range
        startTime = args.start_timestamp;
        endTime = args.end_timestamp;
      } else if (args.hours !== undefined) {
        // Hours lookback
        endTime = Date.now();
        startTime = endTime - (args.hours * 60 * 60 * 1000);
      } else if (args.minutes !== undefined) {
        // Minutes lookback
        endTime = Date.now();
        startTime = endTime - (args.minutes * 60 * 1000);
      } else {
        // Default: last hour
        endTime = Date.now();
        startTime = endTime - (60 * 60 * 1000);
      }

      // Get memories in time window
      const memories = await memoryStore.getMemoriesByTimeWindow(
        startTime,
        endTime,
        args.min_importance,
        args.context_types
      );

      if (memories.length === 0) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: false,
                message: 'No memories found in the specified time window',
                start_time: new Date(startTime).toISOString(),
                end_time: new Date(endTime).toISOString(),
              }, null, 2),
            },
          ],
        };
      }

      // Group memories based on user preference
      const groupedMemories = groupMemories(memories, args.group_by);

      // Format output
      let output: string;
      if (args.format === 'json') {
        output = formatAsJSON(groupedMemories, memories, startTime, endTime, args.include_metadata);
      } else if (args.format === 'markdown') {
        output = formatAsMarkdown(groupedMemories, memories, startTime, endTime, args.include_metadata);
      } else {
        output = formatAsText(groupedMemories, memories, startTime, endTime, args.include_metadata);
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: output,
          },
        ],
      };
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to get time window context: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  },
};

// Helper functions for formatting

function groupMemories(memories: MemoryEntry[], groupBy: string): Map<string, MemoryEntry[]> {
  const groups = new Map<string, MemoryEntry[]>();

  if (groupBy === 'chronological') {
    groups.set('all', memories);
  } else if (groupBy === 'type') {
    memories.forEach(m => {
      const key = m.context_type;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(m);
    });
  } else if (groupBy === 'importance') {
    memories.forEach(m => {
      const key = m.importance >= 8 ? 'High (8-10)' : m.importance >= 5 ? 'Medium (5-7)' : 'Low (1-4)';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(m);
    });
  } else if (groupBy === 'tags') {
    memories.forEach(m => {
      if (m.tags.length === 0) {
        if (!groups.has('untagged')) groups.set('untagged', []);
        groups.get('untagged')!.push(m);
      } else {
        m.tags.forEach(tag => {
          if (!groups.has(tag)) groups.set(tag, []);
          groups.get(tag)!.push(m);
        });
      }
    });
  }

  return groups;
}

function formatAsJSON(
  groups: Map<string, MemoryEntry[]>,
  allMemories: MemoryEntry[],
  startTime: number,
  endTime: number,
  includeMetadata: boolean
): string {
  const data: any = {
    time_window: {
      start: new Date(startTime).toISOString(),
      end: new Date(endTime).toISOString(),
      duration_hours: ((endTime - startTime) / (1000 * 60 * 60)).toFixed(2),
    },
    total_memories: allMemories.length,
    memories: allMemories.map(m => ({
      content: m.content,
      ...(includeMetadata && {
        type: m.context_type,
        importance: m.importance,
        tags: m.tags,
        timestamp: new Date(m.timestamp).toISOString(),
        summary: m.summary,
      }),
    })),
  };

  return JSON.stringify(data, null, 2);
}

function formatAsMarkdown(
  groups: Map<string, MemoryEntry[]>,
  allMemories: MemoryEntry[],
  startTime: number,
  endTime: number,
  includeMetadata: boolean
): string {
  const lines: string[] = [];
  const duration = ((endTime - startTime) / (1000 * 60 * 60)).toFixed(1);

  lines.push(`# Context from ${new Date(startTime).toLocaleString()} to ${new Date(endTime).toLocaleString()}`);
  lines.push('');
  lines.push(`**Duration:** ${duration} hours`);
  lines.push(`**Total Memories:** ${allMemories.length}`);
  lines.push('');
  lines.push('---');
  lines.push('');

  for (const [groupName, memories] of groups) {
    if (groupName !== 'all') {
      lines.push(`## ${groupName.charAt(0).toUpperCase() + groupName.slice(1)}`);
      lines.push('');
    }

    memories.forEach(m => {
      lines.push(`### ${m.summary || m.content.substring(0, 50)}`);
      lines.push('');
      lines.push(m.content);
      lines.push('');

      if (includeMetadata) {
        lines.push(`**Type:** ${m.context_type} | **Importance:** ${m.importance}/10 | **Time:** ${new Date(m.timestamp).toLocaleTimeString()}`);
        if (m.tags.length > 0) {
          lines.push(`**Tags:** ${m.tags.join(', ')}`);
        }
        lines.push('');
      }

      lines.push('---');
      lines.push('');
    });
  }

  return lines.join('\n');
}

function formatAsText(
  groups: Map<string, MemoryEntry[]>,
  allMemories: MemoryEntry[],
  startTime: number,
  endTime: number,
  includeMetadata: boolean
): string {
  const lines: string[] = [];
  const duration = ((endTime - startTime) / (1000 * 60 * 60)).toFixed(1);

  lines.push(`Context from ${new Date(startTime).toLocaleString()} to ${new Date(endTime).toLocaleString()}`);
  lines.push(`Duration: ${duration} hours`);
  lines.push(`Total: ${allMemories.length} memories`);
  lines.push('');
  lines.push('='.repeat(80));
  lines.push('');

  for (const [groupName, memories] of groups) {
    if (groupName !== 'all') {
      lines.push(`[${groupName.toUpperCase()}]`);
      lines.push('');
    }

    memories.forEach((m, index) => {
      lines.push(`${index + 1}. ${m.content}`);
      if (includeMetadata) {
        lines.push(`   [${m.context_type} | importance: ${m.importance}/10 | ${new Date(m.timestamp).toLocaleTimeString()}]`);
        if (m.tags.length > 0) {
          lines.push(`   tags: ${m.tags.join(', ')}`);
        }
      }
      lines.push('');
    });
  }

  return lines.join('\n');
}
