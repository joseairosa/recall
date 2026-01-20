/**
 * Cohere Embedding Provider
 *
 * Highest MTEB benchmark score, excellent multilingual support (100+ languages).
 * Supports multimodal embeddings (text + images).
 *
 * Models:
 * - embed-v4.0: Latest, 1024 dims, multimodal capable
 * - embed-english-v3.0: 1024 dims, English optimized
 * - embed-multilingual-v3.0: 1024 dims, 100+ languages
 */

import {
  EmbeddingProvider,
  EmbeddingProviderConfig,
  DEFAULT_PROVIDER_CONFIGS,
} from '../types.js';

interface CohereEmbeddingResponse {
  id: string;
  embeddings: {
    float: number[][];
  };
  texts: string[];
  meta: {
    api_version: {
      version: string;
    };
    billed_units: {
      input_tokens: number;
    };
  };
}

export class CohereProvider implements EmbeddingProvider {
  readonly name = 'cohere' as const;
  readonly dimensions: number;

  private model: string;
  private apiKey?: string;
  private baseUrl: string;

  constructor(config?: Partial<EmbeddingProviderConfig>) {
    const defaults = DEFAULT_PROVIDER_CONFIGS.cohere;
    this.model = config?.model ?? defaults.model ?? 'embed-v4.0';
    this.dimensions = config?.dimensions ?? defaults.dimensions ?? 1024;
    this.baseUrl = config?.baseUrl ?? defaults.baseUrl ?? 'https://api.cohere.com/v2';
    this.apiKey = config?.apiKey ?? process.env.COHERE_API_KEY;
  }

  isConfigured(): boolean {
    return !!(this.apiKey || process.env.COHERE_API_KEY);
  }

  private getApiKey(): string {
    const apiKey = this.apiKey ?? process.env.COHERE_API_KEY;
    if (!apiKey) {
      throw new Error('COHERE_API_KEY environment variable is required for Cohere provider');
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

      const response = await fetch(`${this.baseUrl}/embed`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          texts: texts,
          input_type: 'search_document', // or 'search_query' for queries
          embedding_types: ['float'],
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Cohere API error: ${response.status} - ${errorBody}`);
      }

      const data = (await response.json()) as CohereEmbeddingResponse;
      const embeddings = data.embeddings.float;

      console.log(
        `[CohereProvider] Generated ${embeddings.length} embeddings ` +
        `using ${this.model} (${data.meta.billed_units.input_tokens} tokens)`
      );

      return embeddings;
    } catch (error) {
      console.error('[CohereProvider] Error generating embeddings:', error);
      throw error;
    }
  }
}
