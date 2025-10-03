#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { checkRedisConnection, closeRedisClient } from './redis/client.js';
import { tools } from './tools/index.js';
import { resources } from './resources/index.js';
import { listPrompts, getPrompt } from './prompts/index.js';

// Create server instance
const server = new Server(
  {
    name: '@joseairosa/recall',
    version: '1.4.0',
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
  const { name, arguments: args } = request.params;

  const tool = tools[name as keyof typeof tools];
  if (!tool) {
    throw new Error(`Unknown tool: ${name}`);
  }

  return await tool.handler(args as any);
});

// List available resources
server.setRequestHandler(ListResourcesRequestSchema, async () => {
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
        description: 'Get memories filtered by context type (directive, information, heading, decision, code_pattern, requirement, error, todo, insight, preference)',
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
        description: 'Search memories using semantic similarity. Requires query parameter "q"',
        mimeType: 'application/json',
      },
    ],
  };
});

// Handle resource reads
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const uriString = request.params.uri;
  const uri = new URL(uriString);

  // For memory:// URIs, resource name is hostname + pathname
  const resourcePath = uri.hostname + uri.pathname;

  // Match resource patterns
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

  // Pattern matching for parameterized resources
  const typeMatch = resourcePath.match(/^by-type\/(.+)$/);
  if (typeMatch) {
    return await resources['memory://by-type/{type}'].handler(uri, { type: typeMatch[1] });
  }

  const tagMatch = resourcePath.match(/^by-tag\/(.+)$/);
  if (tagMatch) {
    return await resources['memory://by-tag/{tag}'].handler(uri, { tag: tagMatch[1] });
  }

  const sessionMatch = resourcePath.match(/^session\/(.+)$/);
  if (sessionMatch) {
    return await resources['memory://session/{session_id}'].handler(uri, { session_id: sessionMatch[1] });
  }

  throw new Error(`Unknown resource: ${request.params.uri}`);
});

// List available prompts
server.setRequestHandler(ListPromptsRequestSchema, async () => {
  const promptsList = await listPrompts();
  return {
    prompts: promptsList,
  };
});

// Get prompt
server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  const promptResult = await getPrompt(request.params.name);
  return promptResult;
});

// Start server
async function main() {
  // Check Redis connection
  console.error('Checking Redis connection...');
  const isConnected = await checkRedisConnection();

  if (!isConnected) {
    console.error('ERROR: Failed to connect to Redis');
    console.error('Please ensure Redis is running and REDIS_URL is set correctly');
    process.exit(1);
  }

  console.error('Redis connection successful');

  // Create transport
  const transport = new StdioServerTransport();

  // Connect server to transport
  await server.connect(transport);

  console.error('Recall MCP Server started successfully');
  console.error('Listening on stdio...');
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.error('\nShutting down...');
  await closeRedisClient();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.error('\nShutting down...');
  await closeRedisClient();
  process.exit(0);
});

// Start the server
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
