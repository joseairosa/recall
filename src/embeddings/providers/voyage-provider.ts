/**
 * Voyage AI Embedding Provider
 *
 * Best-in-class retrieval quality from Stanford researchers.
 * Specifically trained with "tricky negatives" for superior semantic distinction.
 *
 * Models:
 * - voyage-3-large: 1536 dims, best quality
 * - voyage-3: 1024 dims, good balance
 * - voyage-3-lite: 512 dims, fast/cheap
 */

import {
  EmbeddingProvider,
  EmbeddingProviderConfig,
  DEFAULT_PROVIDER_CONFIGS,
} from '../types.js';

interface VoyageEmbeddingResponse {
  object: string;
  data: Array<{
    object: string;
    index: number;
    embedding: number[];
  }>;
  model: string;
  usage: {
    total_tokens: number;
  };
}

export class VoyageProvider implements EmbeddingProvider {
  readonly name = 'voyage' as const;
  readonly dimensions: number;

  private model: string;
  private apiKey?: string;
  private baseUrl: string;

  constructor(config?: Partial<EmbeddingProviderConfig>) {
    const defaults = DEFAULT_PROVIDER_CONFIGS.voyage;
    this.model = config?.model ?? defaults.model ?? 'voyage-3-large';
    this.dimensions = config?.dimensions ?? defaults.dimensions ?? 1536;
    this.baseUrl = config?.baseUrl ?? defaults.baseUrl ?? 'https://api.voyageai.com/v1';
    this.apiKey = config?.apiKey ?? process.env.VOYAGE_API_KEY;
  }

  isConfigured(): boolean {
    return !!(this.apiKey || process.env.VOYAGE_API_KEY);
  }

  private getApiKey(): string {
    const apiKey = this.apiKey ?? process.env.VOYAGE_API_KEY;
    if (!apiKey) {
      throw new Error('VOYAGE_API_KEY environment variable is required for Voyage provider');
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
          input_type: 'document', // or 'query' for search queries
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Voyage API error: ${response.status} - ${errorBody}`);
      }

      const data: VoyageEmbeddingResponse = await response.json();

      // Sort by index to ensure order matches input
      const sortedData = data.data.sort((a, b) => a.index - b.index);
      const embeddings = sortedData.map(item => item.embedding);

      console.log(
        `[VoyageProvider] Generated ${embeddings.length} embeddings ` +
        `using ${data.model} (${data.usage.total_tokens} tokens)`
      );

      return embeddings;
    } catch (error) {
      console.error('[VoyageProvider] Error generating embeddings:', error);
      throw error;
    }
  }
}
