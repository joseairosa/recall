/**
 * MCP HTTP Handler
 *
 * Implements the MCP Streamable HTTP transport for remote Claude connections.
 * Each API key gets its own isolated MCP server instance with tenant-scoped storage.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { AuthenticatedRequest } from './types.js';
import { StorageClient } from '../persistence/storage-client.js';
import { MemoryStore } from '../persistence/memory-store.js';
import { tools, setMemoryStore } from '../tools/index.js';
import { resources, setResourceMemoryStore } from '../resources/index.js';
import { listPrompts, getPrompt } from '../prompts/index.js';

// Session storage: sessionId -> { server, transport, tenantId }
const sessions = new Map<
  string,
  {
    server: Server;
    transport: StreamableHTTPServerTransport;
    tenantId: string;
    lastAccess: number;
  }
>();

// Clean up old sessions periodically (30 min timeout)
const SESSION_TIMEOUT = 30 * 60 * 1000;
setInterval(() => {
  const now = Date.now();
  for (const [sessionId, session] of sessions) {
    if (now - session.lastAccess > SESSION_TIMEOUT) {
      session.transport.close();
      sessions.delete(sessionId);
      console.log(`[MCP] Session ${sessionId} expired`);
    }
  }
}, 60 * 1000); // Check every minute

/**
 * Creates a tenant-scoped MCP Server instance
 */
function createTenantMcpServer(
  storageClient: StorageClient,
  tenantId: string
): Server {
  // Create tenant-scoped memory store
  const memoryStore = new MemoryStore(storageClient, `tenant:${tenantId}`);

  // Create MCP server
  const server = new Server(
    {
      name: '@joseairosa/recall',
      version: '1.7.0',
    },
    {
      capabilities: {
        resources: {},
        tools: {},
        prompts: {},
      },
    }
  );

  // List available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    // Set the memory store for this request context
    setMemoryStore(memoryStore);
    return {
      tools: Object.entries(tools).map(([name, tool]) => ({
        name,
        description: tool.description,
        inputSchema: tool.inputSchema,
      })),
    };
  });

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    // Set the memory store for this request context
    setMemoryStore(memoryStore);

    const { name, arguments: args } = request.params;
    const tool = tools[name as keyof typeof tools];
    if (!tool) {
      throw new Error(`Unknown tool: ${name}`);
    }
    return await tool.handler(args as any);
  });

  // List available resources
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    setResourceMemoryStore(memoryStore);
    return {
      resources: [
        {
          uri: 'memory://recent',
          name: 'Recent Memories',
          description: 'Get the most recent memories (default: 50)',
          mimeType: 'application/json',
        },
        {
          uri: 'memory://by-type/{type}',
          name: 'Memories by Type',
          description:
            'Get memories filtered by context type (directive, information, heading, decision, code_pattern, requirement, error, todo, insight, preference)',
          mimeType: 'application/json',
        },
        {
          uri: 'memory://by-tag/{tag}',
          name: 'Memories by Tag',
          description: 'Get memories filtered by tag',
          mimeType: 'application/json',
        },
        {
          uri: 'memory://important',
          name: 'Important Memories',
          description: 'Get high-importance memories (importance >= 8)',
          mimeType: 'application/json',
        },
        {
          uri: 'memory://session/{session_id}',
          name: 'Session Memories',
          description: 'Get all memories in a specific session',
          mimeType: 'application/json',
        },
        {
          uri: 'memory://sessions',
          name: 'All Sessions',
          description: 'Get list of all sessions',
          mimeType: 'application/json',
        },
        {
          uri: 'memory://summary',
          name: 'Memory Summary',
          description: 'Get overall summary statistics',
          mimeType: 'application/json',
        },
        {
          uri: 'memory://search',
          name: 'Search Memories',
          description:
            'Search memories using semantic similarity. Requires query parameter "q"',
          mimeType: 'application/json',
        },
      ],
    };
  });

  // Handle resource reads
  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    setResourceMemoryStore(memoryStore);

    const uriString = request.params.uri;
    const uri = new URL(uriString);
    const resourcePath = uri.hostname + uri.pathname;

    if (resourcePath === 'recent') {
      return await resources['memory://recent'].handler(uri);
    }
    if (resourcePath === 'important') {
      return await resources['memory://important'].handler(uri);
    }
    if (resourcePath === 'sessions') {
      return await resources['memory://sessions'].handler(uri);
    }
    if (resourcePath === 'summary') {
      return await resources['memory://summary'].handler(uri);
    }
    if (resourcePath === 'search') {
      return await resources['memory://search'].handler(uri);
    }
    if (resourcePath === 'analytics') {
      return await resources['memory://analytics'].handler(uri);
    }

    const typeMatch = resourcePath.match(/^by-type\/(.+)$/);
    if (typeMatch) {
      return await resources['memory://by-type/{type}'].handler(uri, {
        type: typeMatch[1],
      });
    }

    const tagMatch = resourcePath.match(/^by-tag\/(.+)$/);
    if (tagMatch) {
      return await resources['memory://by-tag/{tag}'].handler(uri, {
        tag: tagMatch[1],
      });
    }

    const sessionMatch = resourcePath.match(/^session\/(.+)$/);
    if (sessionMatch) {
      return await resources['memory://session/{session_id}'].handler(uri, {
        session_id: sessionMatch[1],
      });
    }

    throw new Error(`Unknown resource: ${request.params.uri}`);
  });

  // List available prompts
  server.setRequestHandler(ListPromptsRequestSchema, async () => {
    const promptsList = await listPrompts();
    return { prompts: promptsList };
  });

  // Get prompt
  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    return await getPrompt(request.params.name);
  });

  return server;
}

/**
 * Creates the MCP HTTP request handler
 */
export function createMcpHandler(storageClient: StorageClient) {
  return async (req: AuthenticatedRequest, res: Response) => {
    const tenant = req.tenant!;
    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    console.log(
      `[MCP] ${req.method} request from tenant ${tenant.tenantId}, session: ${sessionId || 'new'}`
    );

    try {
      // For existing sessions, reuse the transport
      if (sessionId && sessions.has(sessionId)) {
        const session = sessions.get(sessionId)!;

        // Verify tenant matches
        if (session.tenantId !== tenant.tenantId) {
          res.status(403).json({
            error: 'Session belongs to different tenant',
          });
          return;
        }

        session.lastAccess = Date.now();
        await session.transport.handleRequest(req, res, req.body);
        return;
      }

      // For new sessions or initialization requests, create new server + transport
      const server = createTenantMcpServer(storageClient, tenant.tenantId);

      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        enableJsonResponse: true, // Allow simple JSON responses
        onsessioninitialized: (newSessionId) => {
          console.log(
            `[MCP] Session initialized: ${newSessionId} for tenant ${tenant.tenantId}`
          );
          sessions.set(newSessionId, {
            server,
            transport,
            tenantId: tenant.tenantId,
            lastAccess: Date.now(),
          });
        },
        onsessionclosed: (closedSessionId) => {
          console.log(`[MCP] Session closed: ${closedSessionId}`);
          sessions.delete(closedSessionId);
        },
      });

      // Connect server to transport
      await server.connect(transport);

      // Handle the request
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error('[MCP] Error handling request:', error);
      if (!res.headersSent) {
        res.status(500).json({
          error: 'Internal server error',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  };
}
