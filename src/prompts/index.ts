import { MemoryStore } from '../redis/memory-store.js';
import { formatWorkspaceContext } from './formatters.js';

const memoryStore = new MemoryStore();

export const prompts = {
  workspace_context: {
    name: 'workspace_context',
    description: 'Critical workspace context: directives, decisions, and code patterns',
    arguments: [],
    handler: async () => {
      // Get important memories
      const directives = await memoryStore.getMemoriesByType('directive');
      const decisions = await memoryStore.getMemoriesByType('decision');
      const patterns = await memoryStore.getMemoriesByType('code_pattern');

      // Filter to high-importance only
      const importantDirectives = directives.filter(d => d.importance >= 8);
      const importantDecisions = decisions.filter(d => d.importance >= 7);
      const importantPatterns = patterns.filter(p => p.importance >= 7);

      // Get workspace path from memoryStore
      const stats = await memoryStore.getSummaryStats();
      const workspacePath = stats.workspace_path;

      // Format for Claude
      const contextText = formatWorkspaceContext(
        workspacePath,
        importantDirectives,
        importantDecisions,
        importantPatterns
      );

      return {
        description: 'Workspace-specific context and conventions',
        messages: [
          {
            role: 'user' as const,
            content: {
              type: 'text' as const,
              text: contextText,
            },
          },
        ],
      };
    },
  },
};

// Export list for MCP server
export async function listPrompts() {
  return Object.values(prompts).map(p => ({
    name: p.name,
    description: p.description,
    arguments: p.arguments,
  }));
}

// Export getter for MCP server
export async function getPrompt(name: string) {
  const prompt = prompts[name as keyof typeof prompts];
  if (!prompt) {
    throw new Error(`Unknown prompt: ${name}`);
  }

  return await prompt.handler();
}
