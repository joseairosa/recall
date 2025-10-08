import { query } from '@anthropic-ai/claude-agent-sdk';
import type { ExtractedMemory, ContextType, AnalysisResult } from '../types.js';

export class ConversationAnalyzer {
  constructor() {
    // No API key needed - uses Claude Code subscription via the SDK
  }

  /**
   * Analyze conversation and extract structured memories
   */
  async analyzeConversation(conversationText: string): Promise<ExtractedMemory[]> {
    try {
      const prompt = `Analyze this conversation and extract important information that should be remembered long-term.

For each important piece of information, output EXACTLY in this JSON format (one per line):
{"content":"the information","type":"directive|information|decision|code_pattern|requirement|error|todo|insight|preference","importance":1-10,"tags":["tag1","tag2"],"summary":"brief summary"}

Guidelines:
- Extract directives (instructions to follow)
- Extract decisions (choices made)
- Extract code_patterns (coding conventions)
- Extract requirements (project specs)
- Extract errors (problems and solutions)
- Extract insights (key realizations)
- Extract preferences (user preferences)
- Importance: 10=critical, 8-9=very important, 6-7=important, 1-5=nice to have
- Tags: relevant keywords for categorization
- Summary: max 50 chars

Conversation:
${conversationText}

Output ONLY the JSON objects, one per line, no other text:`;

      const q = query({ prompt });

      // Collect the response
      let responseText = '';
      for await (const message of q) {
        if (message.type === 'assistant' && message.content) {
          for (const block of message.content) {
            if (block.type === 'text') {
              responseText += block.text;
            }
          }
        }
      }

      // Parse JSON lines
      const lines = responseText.split('\n').filter(line => line.trim().startsWith('{'));
      const extracted: ExtractedMemory[] = [];

      for (const line of lines) {
        try {
          const parsed = JSON.parse(line.trim());

          // Validate and normalize
          if (parsed.content && parsed.type && parsed.importance) {
            extracted.push({
              content: parsed.content,
              context_type: this.normalizeContextType(parsed.type),
              importance: Math.min(10, Math.max(1, parseInt(parsed.importance))),
              tags: Array.isArray(parsed.tags) ? parsed.tags : [],
              summary: parsed.summary || undefined,
            });
          }
        } catch (e) {
          console.error('Failed to parse line:', line, e);
          // Skip malformed JSON
        }
      }

      return extracted;
    } catch (error) {
      console.error('Error analyzing conversation:', error);
      throw error;
    }
  }

  /**
   * Generate a summary of a session
   */
  async summarizeSession(memories: Array<{ content: string; context_type: string; importance: number }>): Promise<string> {
    try {
      const memoriesText = memories
        .sort((a, b) => b.importance - a.importance)
        .map(m => `[${m.context_type}] ${m.content}`)
        .join('\n');

      const prompt = `Summarize this work session in 2-3 sentences. Focus on what was accomplished, decided, or learned.

Session memories:
${memoriesText}

Summary (2-3 sentences):`;

      const q = query({ prompt });

      // Collect the response
      let responseText = '';
      for await (const message of q) {
        if (message.type === 'assistant' && message.content) {
          for (const block of message.content) {
            if (block.type === 'text') {
              responseText += block.text;
            }
          }
        }
      }

      return responseText.trim() || 'Session completed with multiple activities';
    } catch (error) {
      console.error('Error summarizing session:', error);
      return 'Session summary unavailable';
    }
  }

  /**
   * Enhance a search query for better semantic matching
   */
  async enhanceQuery(currentTask: string, query?: string): Promise<string> {
    const combined = query ? `${currentTask} ${query}` : currentTask;

    // For now, just return the combined query
    // Could use Claude to expand/enhance the query in the future
    return combined;
  }

  /**
   * Normalize context type strings from Claude
   */
  private normalizeContextType(type: string): ContextType {
    const normalized = type.toLowerCase().trim();

    const mapping: Record<string, ContextType> = {
      'directive': 'directive',
      'instruction': 'directive',
      'command': 'directive',
      'information': 'information',
      'info': 'information',
      'fact': 'information',
      'heading': 'heading',
      'section': 'heading',
      'title': 'heading',
      'decision': 'decision',
      'choice': 'decision',
      'code_pattern': 'code_pattern',
      'pattern': 'code_pattern',
      'convention': 'code_pattern',
      'requirement': 'requirement',
      'req': 'requirement',
      'spec': 'requirement',
      'error': 'error',
      'bug': 'error',
      'issue': 'error',
      'todo': 'todo',
      'task': 'todo',
      'insight': 'insight',
      'realization': 'insight',
      'learning': 'insight',
      'preference': 'preference',
      'pref': 'preference',
      'setting': 'preference',
    };

    return mapping[normalized] || 'information';
  }
}
