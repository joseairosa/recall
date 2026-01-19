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
import { AuthenticatedRequest, PLAN_LIMITS } from './types.js';
import { StorageClient } from '../persistence/storage-client.js';
import { MemoryStore } from '../persistence/memory-store.js';
import { tools, setMemoryStore } from '../tools/index.js';
import { resources, setResourceMemoryStore } from '../resources/index.js';
import { listPrompts, getPrompt } from '../prompts/index.js';
import { WorkspaceService } from './workspace.service.js';
import { createWorkspaceId } from '../types.js';
import { AuditService } from './audit.service.js';

/**
 * Mutable state for a session's workspace
 * This allows the set_workspace tool to change the active workspace
 */
interface SessionState {
  memoryStore: MemoryStore;
  workspaceId: string;
  workspacePath: string;
}

// Session storage: sessionId -> { server, transport, tenantId, state, plan }
const sessions = new Map<
  string,
  {
    server: Server;
    transport: StreamableHTTPServerTransport;
    tenantId: string;
    state: SessionState;
    plan: string;
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
 * Creates a tenant and workspace-scoped MCP Server instance
 * Returns both the server and mutable state for workspace switching
 */
function createTenantMcpServer(
  storageClient: StorageClient,
  tenantId: string,
  workspaceId: string,
  workspacePath: string,
  plan: string,
  auditService: AuditService,
  apiKeyId: string
): { server: Server; state: SessionState } {
  // Create mutable state for workspace (allows set_workspace tool to change it)
  const state: SessionState = {
    memoryStore: new MemoryStore(
      storageClient,
      `tenant:${tenantId}:workspace:${workspaceId}`
    ),
    workspaceId,
    workspacePath,
  };

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

  // Define the set_workspace tool schema
  const setWorkspaceTool = {
    name: 'set_workspace',
    description:
      'Set the current workspace/project for memory isolation. Call this at the start of a session with your current working directory to isolate memories per project. Example: set_workspace({ path: "/Users/jose/projects/my-app" })',
    inputSchema: {
      type: 'object' as const,
      properties: {
        path: {
          type: 'string',
          description:
            'The workspace path (typically process.cwd() or project directory). This will be hashed for storage.',
        },
      },
      required: ['path'],
    },
  };

  // Define the get_workspace tool schema
  const getWorkspaceTool = {
    name: 'get_workspace',
    description: 'Get the current workspace path and ID.',
    inputSchema: {
      type: 'object' as const,
      properties: {},
    },
  };

  // List available tools (including set_workspace and get_workspace)
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    setMemoryStore(state.memoryStore);
    return {
      tools: [
        setWorkspaceTool,
        getWorkspaceTool,
        ...Object.entries(tools).map(([name, tool]) => ({
          name,
          description: tool.description,
          inputSchema: tool.inputSchema,
        })),
      ],
    };
  });

  // Handle tool calls (including set_workspace)
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const startTime = Date.now();

    // Helper to log audit entry for tool calls
    const logAudit = (toolName: string, isError: boolean) => {
      const duration = Date.now() - startTime;
      auditService.log({
        tenantId,
        apiKeyId,
        action: 'mcp_call',
        resource: 'mcp_tool',
        resourceId: toolName,
        method: 'MCP',
        path: `/mcp/tools/${toolName}`,
        statusCode: isError ? 500 : 200,
        duration,
        details: { tool: toolName, args: typeof args === 'object' ? Object.keys(args as object) : [] },
      }).catch(err => console.error('[MCP] Audit log error:', err));
    };

    // Handle set_workspace tool
    if (name === 'set_workspace') {
      const { path } = args as { path: string };

      if (!path || typeof path !== 'string') {
        logAudit('set_workspace', true);
        return {
          content: [
            {
              type: 'text',
              text: 'Error: path is required and must be a string',
            },
          ],
          isError: true,
        };
      }

      const newWorkspaceId = createWorkspaceId(path);

      // If same workspace, no change needed
      if (newWorkspaceId === state.workspaceId) {
        logAudit('set_workspace', false);
        return {
          content: [
            {
              type: 'text',
              text: `Workspace already set to: ${path} (ID: ${newWorkspaceId})`,
            },
          ],
        };
      }

      // Validate/register workspace with plan limits
      const workspaceService = new WorkspaceService(storageClient);
      const workspaceResult = await workspaceService.getOrRegisterWorkspace(
        tenantId,
        path,
        plan
      );

      if (!workspaceResult) {
        // Get total limit including add-ons for accurate error message
        const customerData = await storageClient.hgetall(`customer:${tenantId}`);
        const addonWorkspaces = parseInt(customerData?.workspaceAddons || '0') || 0;
        const basePlanLimit =
          PLAN_LIMITS[plan as keyof typeof PLAN_LIMITS]?.maxWorkspaces ?? 1;
        const totalLimit = basePlanLimit === -1 ? 'unlimited' : basePlanLimit + addonWorkspaces;

        // Get workspace count for debugging
        const debugWorkspaceService = new WorkspaceService(storageClient);
        const debugWorkspaceCount = await debugWorkspaceService.getWorkspaceCount(tenantId);

        logAudit('set_workspace', true);
        return {
          content: [
            {
              type: 'text',
              text: `Error: Workspace limit exceeded. Your ${plan} plan allows ${totalLimit} workspace(s)${addonWorkspaces > 0 ? ` (${basePlanLimit} base + ${addonWorkspaces} add-ons)` : ''}. Current count: ${debugWorkspaceCount}. (Debug: tenant=${tenantId.substring(0, 8)}..., path=${path}). Upgrade your plan or purchase workspace add-ons to add more.`,
            },
          ],
          isError: true,
        };
      }

      // Update state with new workspace
      state.memoryStore = new MemoryStore(
        storageClient,
        `tenant:${tenantId}:workspace:${newWorkspaceId}`
      );
      state.workspaceId = newWorkspaceId;
      state.workspacePath = path;

      console.log(
        `[MCP] Workspace changed for tenant ${tenantId}: ${path} -> ${newWorkspaceId}`
      );

      logAudit('set_workspace', false);
      return {
        content: [
          {
            type: 'text',
            text: `Workspace set to: ${path}\nWorkspace ID: ${newWorkspaceId}\nAll memories will now be isolated to this workspace.`,
          },
        ],
      };
    }

    // Handle get_workspace tool
    if (name === 'get_workspace') {
      logAudit('get_workspace', false);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                path: state.workspacePath,
                id: state.workspaceId,
                isDefault: state.workspacePath === 'default',
              },
              null,
              2
            ),
          },
        ],
      };
    }

    // Handle regular tools
    setMemoryStore(state.memoryStore);

    const tool = tools[name as keyof typeof tools];
    if (!tool) {
      throw new Error(`Unknown tool: ${name}`);
    }

    let isError = false;
    let result: { content: Array<{ type: string; text: string }>; isError?: boolean };
    try {
      result = await tool.handler(args as any);
      isError = result?.isError === true;
    } catch (err) {
      isError = true;
      throw err;
    } finally {
      logAudit(name, isError);
    }

    return result;
  });

  // List available resources
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    setResourceMemoryStore(state.memoryStore);
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
    setResourceMemoryStore(state.memoryStore);

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

  return { server, state };
}

/**
 * Creates the MCP HTTP request handler
 */
export function createMcpHandler(storageClient: StorageClient) {
  const auditService = new AuditService(storageClient);

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

        // Note: We don't validate workspace here anymore since it can change dynamically
        // via the set_workspace tool. The session's state.workspaceId tracks the current workspace.

        session.lastAccess = Date.now();
        await session.transport.handleRequest(req, res, req.body);
        return;
      }

      // If client sends a stale session ID (e.g., after server restart), return 410 Gone
      // with a clear message. The MCP client should handle this by clearing the session
      // and re-initializing. We set a header hint to help debugging.
      if (sessionId && !sessions.has(sessionId)) {
        console.log(`[MCP] Stale session ID detected: ${sessionId}, returning 410 to trigger re-init`);
        res.setHeader('X-Mcp-Session-Expired', 'true');
        res.status(410).json({
          jsonrpc: '2.0',
          error: {
            code: -32000,
            message: 'Session expired or server restarted. Client should clear session ID and reconnect.',
          },
          id: req.body?.id || null,
        });
        return;
      }

      // For new sessions (no session ID), create new server + transport
      const { server, state } = createTenantMcpServer(
        storageClient,
        tenant.tenantId,
        tenant.workspace.id,
        tenant.workspace.path,
        tenant.plan,
        auditService,
        tenant.apiKeyId
      );

      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        enableJsonResponse: true, // Allow simple JSON responses
        onsessioninitialized: (newSessionId) => {
          console.log(
            `[MCP] Session initialized: ${newSessionId} for tenant ${tenant.tenantId}, workspace ${state.workspacePath}`
          );
          sessions.set(newSessionId, {
            server,
            transport,
            tenantId: tenant.tenantId,
            state,
            plan: tenant.plan,
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
