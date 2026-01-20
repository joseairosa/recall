/**
 * OpenAI-Compatible Embedding Provider
 *
 * Handles embeddings for any OpenAI-compatible API:
 * - OpenAI (text-embedding-3-small, text-embedding-3-large)
 * - Deepseek (deepseek-chat)
 * - Grok/xAI (grok-2)
 *
 * All these providers use the same /v1/embeddings endpoint format.
 */

import {
  EmbeddingProvider,
  EmbeddingProviderConfig,
  EmbeddingProviderType,
  DEFAULT_PROVIDER_CONFIGS,
} from '../types.js';

interface OpenAIEmbeddingResponse {
  object: string;
  data: Array<{
    object: string;
    index: number;
    embedding: number[];
  }>;
  model: string;
  usage: {
    prompt_tokens: number;
    total_tokens: number;
  };
}

/**
 * Environment variable names for each provider's API key
 */
const API_KEY_ENV_VARS: Record<string, string> = {
  openai: 'OPENAI_API_KEY',
  deepseek: 'DEEPSEEK_API_KEY',
  grok: 'GROK_API_KEY',
};

export class OpenAICompatibleProvider implements EmbeddingProvider {
  readonly name: EmbeddingProviderType;
  readonly dimensions: number;

  private model: string;
  private apiKey?: string;
  private baseUrl: string;
  private envVarName: string;

  constructor(
    providerType: 'openai' | 'deepseek' | 'grok',
    config?: Partial<EmbeddingProviderConfig>
  ) {
    this.name = providerType;
    const defaults = DEFAULT_PROVIDER_CONFIGS[providerType];

    this.model = config?.model ?? defaults.model ?? 'text-embedding-3-small';
    this.dimensions = config?.dimensions ?? defaults.dimensions ?? 1536;
    this.baseUrl = config?.baseUrl ?? defaults.baseUrl ?? 'https://api.openai.com/v1';
    this.envVarName = API_KEY_ENV_VARS[providerType] ?? 'OPENAI_API_KEY';
    this.apiKey = config?.apiKey ?? process.env[this.envVarName];
  }

  isConfigured(): boolean {
    return !!(this.apiKey || process.env[this.envVarName]);
  }

  private getApiKey(): string {
    const apiKey = this.apiKey ?? process.env[this.envVarName];
    if (!apiKey) {
      throw new Error(`${this.envVarName} environment variable is required for ${this.name} provider`);
    }
    return apiKey;
  }

  async generateEmbedding(text: string): Promise<number[]> {
    const embeddings = await this.generateEmbeddings([text]);
    return embeddings[0];
  }

  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    try {
      const apiKey = this.getApiKey();

      const response = await fetch(`${this.baseUrl}/embeddings`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          input: texts,
          encoding_format: 'float',
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`${this.name} API error: ${response.status} - ${errorBody}`);
      }

      const data = (await response.json()) as OpenAIEmbeddingResponse;

      // Sort by index to ensure order matches input
      const sortedData = data.data.sort((a, b) => a.index - b.index);
      const embeddings = sortedData.map(item => item.embedding);

      console.log(
        `[${this.name}Provider] Generated ${embeddings.length} embeddings ` +
        `using ${data.model} (${data.usage.total_tokens} tokens)`
      );

      return embeddings;
    } catch (error) {
      console.error(`[${this.name}Provider] Error generating embeddings:`, error);
      throw error;
    }
  }
}

// Convenience factory functions
export const createOpenAIProvider = (config?: Partial<EmbeddingProviderConfig>) =>
  new OpenAICompatibleProvider('openai', config);

export const createDeepseekProvider = (config?: Partial<EmbeddingProviderConfig>) =>
  new OpenAICompatibleProvider('deepseek', config);

export const createGrokProvider = (config?: Partial<EmbeddingProviderConfig>) =>
  new OpenAICompatibleProvider('grok', config);
