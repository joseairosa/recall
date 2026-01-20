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
  type ContextType,
} from '../types.js';

// ============================================================================
// Auto-Hook Schemas (v1.8.0)
// ============================================================================

/**
 * Schema for auto_session_start - automatically retrieves relevant context at session start
 */
export const AutoSessionStartSchema = z.object({
  workspace_path: z.string().optional().describe('Current workspace path for context'),
  task_hint: z.string().optional().describe('Optional hint about what you will be working on'),
  include_recent_decisions: z.boolean().default(true).describe('Include recent decisions (last 24h)'),
  include_directives: z.boolean().default(true).describe('Include active directives'),
  include_patterns: z.boolean().default(true).describe('Include code patterns'),
  max_context_tokens: z.number().default(2000).describe('Maximum tokens of context to return'),
});

export type AutoSessionStart = z.infer<typeof AutoSessionStartSchema>;

/**
 * Schema for quick_store_decision - streamlined decision storage
 */
export const QuickStoreDecisionSchema = z.object({
  decision: z.string().min(1).describe('The decision that was made'),
  reasoning: z.string().optional().describe('Why this decision was made'),
  alternatives_considered: z.array(z.string()).optional().describe('Alternatives that were considered'),
  tags: z.array(z.string()).default([]).describe('Tags for categorization'),
  importance: z.number().min(1).max(10).default(7).describe('Importance (default 7 for decisions)'),
});

export type QuickStoreDecision = z.infer<typeof QuickStoreDecisionSchema>;

/**
 * Schema for should_use_rlm - checks if content needs RLM processing
 */
export const ShouldUseRLMSchema = z.object({
  content: z.string().describe('Content to analyze'),
  task: z.string().describe('What you want to do with this content'),
});

export type ShouldUseRLM = z.infer<typeof ShouldUseRLMSchema>;

// Injected memory store for multi-tenant support
let memoryStore: MemoryStore | null = null;

// Lazy-loaded analyzer - only initialized when needed (requires ANTHROPIC_API_KEY)
let _analyzer: ConversationAnalyzer | null = null;
function getAnalyzer(): ConversationAnalyzer {
  if (!_analyzer) {
    _analyzer = new ConversationAnalyzer();
  }
  return _analyzer;
}

/**
 * Sets the memory store for this module (called from tools/index.ts)
 */
export function setContextMemoryStore(store: MemoryStore): void {
  memoryStore = store;
}

function getStore(): MemoryStore {
  if (!memoryStore) {
    throw new Error('MemoryStore not initialized. Call setContextMemoryStore() first.');
  }
  return memoryStore;
}

/**
 * recall_relevant_context - Proactively retrieve relevant memories for current task
 *
 * v1.8.1: Now returns summary-only by default for context efficiency (~73% token reduction)
 */
export const recall_relevant_context = {
  description: 'Proactively search memory for context relevant to current task. Use this when you need to recall patterns, decisions, or conventions. Returns summaries by default for context efficiency.',
  inputSchema: zodToJsonSchema(RecallContextSchema),
  handler: async (args: z.infer<typeof RecallContextSchema>) => {
    try {
      // Enhance the search query
      const enhancedQuery = await getAnalyzer().enhanceQuery(args.current_task, args.query);

      // Semantic search with filters
      const results = await getStore().searchMemories(
        enhancedQuery,
        args.limit,
        args.min_importance
      );

      // Format results for context efficiency (v1.8.1)
      // Returns summary instead of full content to reduce context bloat
      const formattedResults = results.map(r => ({
        memory_id: r.id,
        // Use summary if available, otherwise truncate content
        summary: r.summary || (r.content.length > 150 ? r.content.substring(0, 150) + '...' : r.content),
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
              // Hint for retrieving full content if needed
              ...(results.length > 0 && {
                hint: 'Use get_memory with memory_id to retrieve full content for specific memories',
              }),
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
      const extracted = await getAnalyzer().analyzeConversation(args.conversation_text);

      const result: AnalysisResult = {
        extracted_memories: extracted,
        total_count: extracted.length,
      };

      // Auto-store if requested
      if (args.auto_store && extracted.length > 0) {
        const memories = await getStore().createMemories(
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

      const allRecent = await getStore().getRecentMemories(100);
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
      const summary = await getAnalyzer().summarizeSession(
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
        sessionInfo = await getStore().createSession(
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
      const memories = await getStore().getMemoriesByTimeWindow(
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

// ============================================================================
// Automatic Hooks (v1.8.0)
// These tools make Recall automatic - no manual intervention needed
// ============================================================================

/**
 * auto_session_start - CALL THIS AT THE START OF EVERY SESSION
 *
 * Automatically retrieves relevant context based on:
 * - Recent decisions (last 24h)
 * - Active directives
 * - Code patterns
 * - High-importance memories
 *
 * This solves the "NOT automatic" limitation by providing a single tool
 * that Claude should call at the start of every conversation.
 */
export const auto_session_start = {
  description:
    'AUTOMATIC: Call this at the START of every session to load relevant context. ' +
    'Returns recent decisions, active directives, and code patterns. ' +
    'This makes recall automatic - no manual searching needed.',
  inputSchema: zodToJsonSchema(AutoSessionStartSchema),
  handler: async (args: z.infer<typeof AutoSessionStartSchema>) => {
    try {
      const store = getStore();
      const contextParts: string[] = [];
      let totalTokens = 0;
      const maxTokens = args.max_context_tokens;

      // Helper to estimate tokens (rough: 4 chars per token)
      const estimateTokens = (text: string) => Math.ceil(text.length / 4);

      // 1. Get active directives (always important)
      if (args.include_directives) {
        const directives = await store.getMemoriesByType('directive' as ContextType);
        const activeDirectives = directives.filter(d => d.importance >= 7);

        if (activeDirectives.length > 0) {
          const directivesText = activeDirectives
            .slice(0, 5) // Max 5 directives
            .map(d => `- ${d.content}`)
            .join('\n');

          const section = `## Active Directives\n${directivesText}`;
          const sectionTokens = estimateTokens(section);

          if (totalTokens + sectionTokens < maxTokens) {
            contextParts.push(section);
            totalTokens += sectionTokens;
          }
        }
      }

      // 2. Get recent decisions (last 24h)
      if (args.include_recent_decisions) {
        const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
        const decisions = await store.getMemoriesByType('decision' as ContextType);
        const recentDecisions = decisions
          .filter(d => d.timestamp >= oneDayAgo)
          .sort((a, b) => b.importance - a.importance)
          .slice(0, 5);

        if (recentDecisions.length > 0) {
          const decisionsText = recentDecisions
            .map(d => `- ${d.content}`)
            .join('\n');

          const section = `## Recent Decisions (last 24h)\n${decisionsText}`;
          const sectionTokens = estimateTokens(section);

          if (totalTokens + sectionTokens < maxTokens) {
            contextParts.push(section);
            totalTokens += sectionTokens;
          }
        }
      }

      // 3. Get code patterns
      if (args.include_patterns) {
        const patterns = await store.getMemoriesByType('code_pattern' as ContextType);
        const importantPatterns = patterns
          .filter(p => p.importance >= 6)
          .sort((a, b) => b.importance - a.importance)
          .slice(0, 3);

        if (importantPatterns.length > 0) {
          const patternsText = importantPatterns
            .map(p => `- ${p.content}`)
            .join('\n');

          const section = `## Code Patterns\n${patternsText}`;
          const sectionTokens = estimateTokens(section);

          if (totalTokens + sectionTokens < maxTokens) {
            contextParts.push(section);
            totalTokens += sectionTokens;
          }
        }
      }

      // 4. If task hint provided, do a targeted search
      if (args.task_hint && totalTokens < maxTokens) {
        try {
          const enhancedQuery = await getAnalyzer().enhanceQuery(args.task_hint, args.task_hint);
          const relevant = await store.searchMemories(enhancedQuery, 5, 6);

          if (relevant.length > 0) {
            const relevantText = relevant
              .map(r => `- [${r.context_type}] ${r.content}`)
              .join('\n');

            const section = `## Relevant to "${args.task_hint}"\n${relevantText}`;
            const sectionTokens = estimateTokens(section);

            if (totalTokens + sectionTokens < maxTokens) {
              contextParts.push(section);
              totalTokens += sectionTokens;
            }
          }
        } catch {
          // Analyzer may not be available, skip targeted search
        }
      }

      // 5. Get high-importance items if space remains
      if (totalTokens < maxTokens * 0.8) {
        const important = await store.getImportantMemories(9, 3);
        const criticalItems = important.filter(
          i => !contextParts.some(p => p.includes(i.content))
        );

        if (criticalItems.length > 0) {
          const criticalText = criticalItems
            .map(i => `- [${i.context_type}] ${i.content}`)
            .join('\n');

          const section = `## Critical Items (importance 9+)\n${criticalText}`;
          const sectionTokens = estimateTokens(section);

          if (totalTokens + sectionTokens < maxTokens) {
            contextParts.push(section);
            totalTokens += sectionTokens;
          }
        }
      }

      // Build final context
      const hasContext = contextParts.length > 0;
      const contextOutput = hasContext
        ? `# Session Context\n\n${contextParts.join('\n\n')}`
        : 'No relevant context found. This appears to be a fresh start.';

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              success: true,
              has_context: hasContext,
              sections_loaded: contextParts.length,
              estimated_tokens: totalTokens,
              context: contextOutput,
              tip: hasContext
                ? 'Context loaded! Refer to these decisions and patterns as you work.'
                : 'No prior context found. Important decisions and patterns will be stored for next time.',
            }, null, 2),
          },
        ],
      };
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to load session context: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  },
};

/**
 * quick_store_decision - Streamlined decision storage
 *
 * Use this after making important decisions. It formats the decision
 * with reasoning and alternatives for better recall later.
 */
export const quick_store_decision = {
  description:
    'AUTOMATIC: Quickly store a decision after making it. ' +
    'Automatically formats with reasoning and alternatives. ' +
    'Use this after any significant architectural, design, or implementation choice.',
  inputSchema: zodToJsonSchema(QuickStoreDecisionSchema),
  handler: async (args: z.infer<typeof QuickStoreDecisionSchema>) => {
    try {
      const store = getStore();

      // Format decision with structured content
      let content = `DECISION: ${args.decision}`;

      if (args.reasoning) {
        content += `\n\nREASONING: ${args.reasoning}`;
      }

      if (args.alternatives_considered && args.alternatives_considered.length > 0) {
        content += `\n\nALTERNATIVES CONSIDERED:\n${args.alternatives_considered.map(a => `- ${a}`).join('\n')}`;
      }

      // Store with appropriate metadata
      const memory = await store.createMemory({
        content,
        context_type: 'decision',
        importance: args.importance,
        tags: [...args.tags, 'decision', 'auto-stored'],
        summary: `Decision: ${args.decision.substring(0, 80)}${args.decision.length > 80 ? '...' : ''}`,
        is_global: false,
      });

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              success: true,
              memory_id: memory.id,
              message: 'Decision stored! It will be recalled in future sessions.',
              stored_content: content.substring(0, 200) + (content.length > 200 ? '...' : ''),
            }, null, 2),
          },
        ],
      };
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to store decision: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  },
};

/**
 * should_use_rlm - Check if content needs RLM processing
 *
 * Call this before processing large content to determine if you should
 * use the RLM tools (create_execution_context, decompose_task, etc.)
 */
export const should_use_rlm = {
  description:
    'AUTOMATIC: Check if content is too large for direct processing. ' +
    'Returns recommendation on whether to use RLM tools. ' +
    'Call this before attempting to analyze large files, logs, or documents.',
  inputSchema: zodToJsonSchema(ShouldUseRLMSchema),
  handler: async (args: z.infer<typeof ShouldUseRLMSchema>) => {
    try {
      // Estimate token count (rough: 4 chars per token)
      const estimatedTokens = Math.ceil(args.content.length / 4);

      // Thresholds
      const SAFE_THRESHOLD = 4000;      // Under this: process directly
      const WARNING_THRESHOLD = 8000;    // This range: consider RLM
      const RLM_REQUIRED_THRESHOLD = 15000; // Above this: must use RLM

      // Determine recommendation
      let recommendation: 'direct' | 'consider_rlm' | 'use_rlm';
      let reason: string;
      let suggestedStrategy: string | null = null;

      if (estimatedTokens <= SAFE_THRESHOLD) {
        recommendation = 'direct';
        reason = `Content is ~${estimatedTokens} tokens. Safe to process directly.`;
      } else if (estimatedTokens <= WARNING_THRESHOLD) {
        recommendation = 'consider_rlm';
        reason = `Content is ~${estimatedTokens} tokens. Consider using RLM for better accuracy.`;
        suggestedStrategy = detectSuggestedStrategy(args.content, args.task);
      } else {
        recommendation = 'use_rlm';
        reason = `Content is ~${estimatedTokens} tokens. RLM strongly recommended to avoid context overflow.`;
        suggestedStrategy = detectSuggestedStrategy(args.content, args.task);
      }

      // Build guidance
      const guidance = recommendation === 'direct'
        ? 'Process the content directly in your analysis.'
        : `To use RLM:\n1. Call create_execution_context(task="${args.task}", context=<content>)\n2. Call decompose_task(chain_id, strategy="${suggestedStrategy || 'chunk'}")\n3. Process each subtask with inject_context_snippet\n4. Call merge_results when done`;

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              estimated_tokens: estimatedTokens,
              content_length_chars: args.content.length,
              recommendation,
              reason,
              suggested_strategy: suggestedStrategy,
              guidance,
              thresholds: {
                safe: `<${SAFE_THRESHOLD} tokens`,
                consider_rlm: `${SAFE_THRESHOLD}-${WARNING_THRESHOLD} tokens`,
                use_rlm: `>${RLM_REQUIRED_THRESHOLD} tokens`,
              },
            }, null, 2),
          },
        ],
      };
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to analyze content size: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  },
};

/**
 * Helper to suggest RLM strategy based on content and task
 */
function detectSuggestedStrategy(content: string, task: string): string {
  const taskLower = task.toLowerCase();
  const contentSample = content.substring(0, 1000).toLowerCase();

  // Filter strategy indicators
  if (
    taskLower.includes('find') ||
    taskLower.includes('search') ||
    taskLower.includes('error') ||
    taskLower.includes('warning') ||
    contentSample.includes('error') ||
    contentSample.includes('[error]') ||
    contentSample.includes('exception')
  ) {
    return 'filter';
  }

  // Aggregate strategy indicators
  if (
    taskLower.includes('summarize') ||
    taskLower.includes('overview') ||
    taskLower.includes('combine')
  ) {
    return 'aggregate';
  }

  // Recursive for very complex content
  if (content.length > 200000) {
    return 'recursive';
  }

  // Default: chunk
  return 'chunk';
}
