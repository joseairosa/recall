import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { MemoryStore } from '../redis/memory-store.js';
import type { ContextType } from '../types.js';
import { getAnalytics } from './analytics.js';
import { getWorkspaceMode, WorkspaceMode, RedisKeys } from '../types.js';
import { getRedisClient } from '../redis/client.js';

const memoryStore = new MemoryStore();
const redis = getRedisClient();

export const resources = {
  'memory://recent': {
    name: 'Recent Memories',
    description: 'Get the most recent memories (default: 50)',
    mimeType: 'application/json',
    handler: async (uri: URL) => {
      const limit = parseInt(uri.searchParams.get('limit') || '50', 10);
      const memories = await memoryStore.getRecentMemories(limit);

      return {
        contents: [
          {
            uri: uri.toString(),
            mimeType: 'application/json',
            text: JSON.stringify(
              {
                count: memories.length,
                memories: memories.map(m => ({
                  memory_id: m.id,
                  content: m.content,
                  summary: m.summary,
                  context_type: m.context_type,
                  importance: m.importance,
                  tags: m.tags,
                  timestamp: m.timestamp,
                  session_id: m.session_id,
                })),
              },
              null,
              2
            ),
          },
        ],
      };
    },
  },

  'memory://by-type/{type}': {
    name: 'Memories by Type',
    description: 'Get memories filtered by context type',
    mimeType: 'application/json',
    handler: async (uri: URL, params: { type: string }) => {
      const type = params.type as ContextType;
      const limit = uri.searchParams.get('limit') ? parseInt(uri.searchParams.get('limit')!, 10) : undefined;

      const memories = await memoryStore.getMemoriesByType(type, limit);

      return {
        contents: [
          {
            uri: uri.toString(),
            mimeType: 'application/json',
            text: JSON.stringify(
              {
                context_type: type,
                count: memories.length,
                memories: memories.map(m => ({
                  memory_id: m.id,
                  content: m.content,
                  summary: m.summary,
                  importance: m.importance,
                  tags: m.tags,
                  timestamp: m.timestamp,
                })),
              },
              null,
              2
            ),
          },
        ],
      };
    },
  },

  'memory://by-tag/{tag}': {
    name: 'Memories by Tag',
    description: 'Get memories filtered by tag',
    mimeType: 'application/json',
    handler: async (uri: URL, params: { tag: string }) => {
      const { tag } = params;
      const limit = uri.searchParams.get('limit') ? parseInt(uri.searchParams.get('limit')!, 10) : undefined;

      const memories = await memoryStore.getMemoriesByTag(tag, limit);

      return {
        contents: [
          {
            uri: uri.toString(),
            mimeType: 'application/json',
            text: JSON.stringify(
              {
                tag,
                count: memories.length,
                memories: memories.map(m => ({
                  memory_id: m.id,
                  content: m.content,
                  summary: m.summary,
                  context_type: m.context_type,
                  importance: m.importance,
                  tags: m.tags,
                  timestamp: m.timestamp,
                })),
              },
              null,
              2
            ),
          },
        ],
      };
    },
  },

  'memory://important': {
    name: 'Important Memories',
    description: 'Get high-importance memories (importance >= 8)',
    mimeType: 'application/json',
    handler: async (uri: URL) => {
      const minImportance = parseInt(uri.searchParams.get('min') || '8', 10);
      const limit = uri.searchParams.get('limit') ? parseInt(uri.searchParams.get('limit')!, 10) : undefined;

      const memories = await memoryStore.getImportantMemories(minImportance, limit);

      return {
        contents: [
          {
            uri: uri.toString(),
            mimeType: 'application/json',
            text: JSON.stringify(
              {
                min_importance: minImportance,
                count: memories.length,
                memories: memories.map(m => ({
                  memory_id: m.id,
                  content: m.content,
                  summary: m.summary,
                  context_type: m.context_type,
                  importance: m.importance,
                  tags: m.tags,
                  timestamp: m.timestamp,
                })),
              },
              null,
              2
            ),
          },
        ],
      };
    },
  },

  'memory://session/{session_id}': {
    name: 'Session Memories',
    description: 'Get all memories in a specific session',
    mimeType: 'application/json',
    handler: async (uri: URL, params: { session_id: string }) => {
      const { session_id } = params;
      const session = await memoryStore.getSession(session_id);

      if (!session) {
        throw new McpError(ErrorCode.InvalidRequest, `Session ${session_id} not found`);
      }

      const memories = await memoryStore.getSessionMemories(session_id);

      return {
        contents: [
          {
            uri: uri.toString(),
            mimeType: 'application/json',
            text: JSON.stringify(
              {
                session_id: session.session_id,
                session_name: session.session_name,
                created_at: session.created_at,
                summary: session.summary,
                count: memories.length,
                memories: memories.map(m => ({
                  memory_id: m.id,
                  content: m.content,
                  summary: m.summary,
                  context_type: m.context_type,
                  importance: m.importance,
                  tags: m.tags,
                  timestamp: m.timestamp,
                })),
              },
              null,
              2
            ),
          },
        ],
      };
    },
  },

  'memory://sessions': {
    name: 'All Sessions',
    description: 'Get list of all sessions',
    mimeType: 'application/json',
    handler: async (uri: URL) => {
      const sessions = await memoryStore.getAllSessions();

      return {
        contents: [
          {
            uri: uri.toString(),
            mimeType: 'application/json',
            text: JSON.stringify(
              {
                count: sessions.length,
                sessions: sessions.map(s => ({
                  session_id: s.session_id,
                  session_name: s.session_name,
                  created_at: s.created_at,
                  memory_count: s.memory_count,
                  summary: s.summary,
                })),
              },
              null,
              2
            ),
          },
        ],
      };
    },
  },

  'memory://summary': {
    name: 'Memory Summary',
    description: 'Get overall summary statistics of stored memories',
    mimeType: 'application/json',
    handler: async (uri: URL) => {
      const stats = await memoryStore.getSummaryStats();

      return {
        contents: [
          {
            uri: uri.toString(),
            mimeType: 'application/json',
            text: JSON.stringify(stats, null, 2),
          },
        ],
      };
    },
  },

  'memory://search': {
    name: 'Search Memories',
    description: 'Search memories using semantic similarity',
    mimeType: 'application/json',
    handler: async (uri: URL) => {
      const query = uri.searchParams.get('q');
      if (!query) {
        throw new McpError(ErrorCode.InvalidRequest, 'Query parameter "q" is required');
      }

      const limit = parseInt(uri.searchParams.get('limit') || '10', 10);
      const minImportance = uri.searchParams.get('min_importance')
        ? parseInt(uri.searchParams.get('min_importance')!, 10)
        : undefined;

      const results = await memoryStore.searchMemories(query, limit, minImportance);

      return {
        contents: [
          {
            uri: uri.toString(),
            mimeType: 'application/json',
            text: JSON.stringify(
              {
                query,
                count: results.length,
                results: results.map(r => ({
                  memory_id: r.id,
                  content: r.content,
                  summary: r.summary,
                  context_type: r.context_type,
                  importance: r.importance,
                  tags: r.tags,
                  similarity: r.similarity,
                  timestamp: r.timestamp,
                })),
              },
              null,
              2
            ),
          },
        ],
      };
    },
  },

  'memory://analytics': {
    name: 'Memory Analytics',
    description: 'Get detailed analytics about memory usage and trends',
    mimeType: 'text/markdown',
    handler: async (uri: URL) => {
      const analytics = await getAnalytics();

      return {
        contents: [
          {
            uri: uri.toString(),
            mimeType: 'text/markdown',
            text: analytics,
          },
        ],
      };
    },
  },

  // Global memory resources (v1.3.0)
  'memory://global/recent': {
    name: 'Recent Global Memories',
    description: 'Get the most recent global memories (cross-workspace)',
    mimeType: 'application/json',
    handler: async (uri: URL) => {
      const mode = getWorkspaceMode();
      if (mode === WorkspaceMode.ISOLATED) {
        throw new McpError(
          ErrorCode.InvalidRequest,
          'Global memories are not available in isolated mode. Set WORKSPACE_MODE=hybrid or global to access global memories.'
        );
      }

      const limit = parseInt(uri.searchParams.get('limit') || '50', 10);
      const ids = await redis.zrevrange(RedisKeys.globalTimeline(), 0, limit - 1);
      const memories = await memoryStore.getMemories(ids);

      return {
        contents: [
          {
            uri: uri.toString(),
            mimeType: 'application/json',
            text: JSON.stringify(
              {
                count: memories.length,
                workspace_mode: mode,
                memories: memories.map(m => ({
                  memory_id: m.id,
                  content: m.content,
                  summary: m.summary,
                  context_type: m.context_type,
                  importance: m.importance,
                  tags: m.tags,
                  timestamp: m.timestamp,
                  is_global: m.is_global,
                })),
              },
              null,
              2
            ),
          },
        ],
      };
    },
  },

  'memory://global/by-type/{type}': {
    name: 'Global Memories by Type',
    description: 'Get global memories filtered by context type',
    mimeType: 'application/json',
    handler: async (uri: URL, params: { type: string }) => {
      const mode = getWorkspaceMode();
      if (mode === WorkspaceMode.ISOLATED) {
        throw new McpError(
          ErrorCode.InvalidRequest,
          'Global memories are not available in isolated mode. Set WORKSPACE_MODE=hybrid or global to access global memories.'
        );
      }

      const type = params.type as ContextType;
      const limit = uri.searchParams.get('limit') ? parseInt(uri.searchParams.get('limit')!, 10) : undefined;

      const ids = await redis.smembers(RedisKeys.globalByType(type));
      const allMemories = await memoryStore.getMemories(ids);

      // Sort by timestamp descending
      allMemories.sort((a, b) => b.timestamp - a.timestamp);
      const memories = limit ? allMemories.slice(0, limit) : allMemories;

      return {
        contents: [
          {
            uri: uri.toString(),
            mimeType: 'application/json',
            text: JSON.stringify(
              {
                context_type: type,
                count: memories.length,
                workspace_mode: mode,
                memories: memories.map(m => ({
                  memory_id: m.id,
                  content: m.content,
                  summary: m.summary,
                  importance: m.importance,
                  tags: m.tags,
                  timestamp: m.timestamp,
                  is_global: m.is_global,
                })),
              },
              null,
              2
            ),
          },
        ],
      };
    },
  },

  'memory://global/by-tag/{tag}': {
    name: 'Global Memories by Tag',
    description: 'Get global memories filtered by tag',
    mimeType: 'application/json',
    handler: async (uri: URL, params: { tag: string }) => {
      const mode = getWorkspaceMode();
      if (mode === WorkspaceMode.ISOLATED) {
        throw new McpError(
          ErrorCode.InvalidRequest,
          'Global memories are not available in isolated mode. Set WORKSPACE_MODE=hybrid or global to access global memories.'
        );
      }

      const { tag } = params;
      const limit = uri.searchParams.get('limit') ? parseInt(uri.searchParams.get('limit')!, 10) : undefined;

      const ids = await redis.smembers(RedisKeys.globalByTag(tag));
      const allMemories = await memoryStore.getMemories(ids);

      // Sort by timestamp descending
      allMemories.sort((a, b) => b.timestamp - a.timestamp);
      const memories = limit ? allMemories.slice(0, limit) : allMemories;

      return {
        contents: [
          {
            uri: uri.toString(),
            mimeType: 'application/json',
            text: JSON.stringify(
              {
                tag,
                count: memories.length,
                workspace_mode: mode,
                memories: memories.map(m => ({
                  memory_id: m.id,
                  content: m.content,
                  summary: m.summary,
                  context_type: m.context_type,
                  importance: m.importance,
                  tags: m.tags,
                  timestamp: m.timestamp,
                  is_global: m.is_global,
                })),
              },
              null,
              2
            ),
          },
        ],
      };
    },
  },

  'memory://global/important': {
    name: 'Important Global Memories',
    description: 'Get high-importance global memories (importance >= 8)',
    mimeType: 'application/json',
    handler: async (uri: URL) => {
      const mode = getWorkspaceMode();
      if (mode === WorkspaceMode.ISOLATED) {
        throw new McpError(
          ErrorCode.InvalidRequest,
          'Global memories are not available in isolated mode. Set WORKSPACE_MODE=hybrid or global to access global memories.'
        );
      }

      const minImportance = parseInt(uri.searchParams.get('min') || '8', 10);
      const limit = uri.searchParams.get('limit') ? parseInt(uri.searchParams.get('limit')!, 10) : undefined;

      const results = await redis.zrevrangebyscore(
        RedisKeys.globalImportant(),
        10,
        minImportance,
        'LIMIT',
        0,
        limit || 100
      );

      const memories = await memoryStore.getMemories(results);

      return {
        contents: [
          {
            uri: uri.toString(),
            mimeType: 'application/json',
            text: JSON.stringify(
              {
                min_importance: minImportance,
                count: memories.length,
                workspace_mode: mode,
                memories: memories.map(m => ({
                  memory_id: m.id,
                  content: m.content,
                  summary: m.summary,
                  context_type: m.context_type,
                  importance: m.importance,
                  tags: m.tags,
                  timestamp: m.timestamp,
                  is_global: m.is_global,
                })),
              },
              null,
              2
            ),
          },
        ],
      };
    },
  },

  'memory://global/search': {
    name: 'Search Global Memories',
    description: 'Search global memories using semantic similarity',
    mimeType: 'application/json',
    handler: async (uri: URL) => {
      const mode = getWorkspaceMode();
      if (mode === WorkspaceMode.ISOLATED) {
        throw new McpError(
          ErrorCode.InvalidRequest,
          'Global memories are not available in isolated mode. Set WORKSPACE_MODE=hybrid or global to access global memories.'
        );
      }

      const query = uri.searchParams.get('q');
      if (!query) {
        throw new McpError(ErrorCode.InvalidRequest, 'Query parameter "q" is required');
      }

      const limit = parseInt(uri.searchParams.get('limit') || '10', 10);

      // Temporarily switch to global mode for search
      const originalMode = process.env.WORKSPACE_MODE;
      process.env.WORKSPACE_MODE = 'global';

      try {
        const results = await memoryStore.searchMemories(query, limit);

        return {
          contents: [
            {
              uri: uri.toString(),
              mimeType: 'application/json',
              text: JSON.stringify(
                {
                  query,
                  count: results.length,
                  workspace_mode: mode,
                  results: results.map(r => ({
                    memory_id: r.id,
                    content: r.content,
                    summary: r.summary,
                    context_type: r.context_type,
                    importance: r.importance,
                    tags: r.tags,
                    similarity: r.similarity,
                    timestamp: r.timestamp,
                    is_global: r.is_global,
                  })),
                },
                null,
                2
              ),
            },
          ],
        };
      } finally {
        // Restore original mode
        if (originalMode) {
          process.env.WORKSPACE_MODE = originalMode;
        } else {
          delete process.env.WORKSPACE_MODE;
        }
      }
    },
  },
};
