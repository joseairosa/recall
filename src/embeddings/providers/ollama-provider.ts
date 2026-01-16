/**
 * Ollama Embedding Provider
 *
 * Uses local Ollama instance for embeddings.
 * Great for self-hosted scenarios without API costs.
 *
 * Popular embedding models:
 * - nomic-embed-text: 768 dimensions, good quality
 * - mxbai-embed-large: 1024 dimensions, high quality
 * - all-minilm: 384 dimensions, fast and lightweight
 */

import {
  EmbeddingProvider,
  EmbeddingProviderConfig,
  DEFAULT_PROVIDER_CONFIGS,
} from '../types.js';

interface OllamaEmbeddingResponse {
  embedding: number[];
}

export class OllamaProvider implements EmbeddingProvider {
  readonly name = 'ollama' as const;
  readonly dimensions: number;

  private model: string;
  private baseUrl: string;

  constructor(config?: Partial<EmbeddingProviderConfig>) {
    const defaults = DEFAULT_PROVIDER_CONFIGS.ollama;
    this.model = config?.model ?? defaults.model ?? 'nomic-embed-text';
    this.dimensions = config?.dimensions ?? defaults.dimensions ?? 768;
    this.baseUrl = config?.baseUrl ?? process.env.OLLAMA_BASE_URL ?? defaults.baseUrl ?? 'http://localhost:11434';
  }

  isConfigured(): boolean {
    // Ollama doesn't require an API key, just needs to be running
    return true;
  }

  async generateEmbedding(text: string): Promise<number[]> {
    try {
      const response = await fetch(`${this.baseUrl}/api/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          prompt: text,
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Ollama API error: ${response.status} - ${errorBody}`);
      }

      const data: OllamaEmbeddingResponse = await response.json();
      return data.embedding;
    } catch (error) {
      console.error('[OllamaProvider] Error generating embedding:', error);
      throw error;
    }
  }

  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    try {
      // Ollama doesn't support batch embeddings, so we process sequentially
      const embeddings: number[][] = [];

      for (const text of texts) {
        const embedding = await this.generateEmbedding(text);
        embeddings.push(embedding);
      }

      console.log(`[OllamaProvider] Generated ${embeddings.length} embeddings using ${this.model}`);
      return embeddings;
    } catch (error) {
      console.error('[OllamaProvider] Error generating embeddings:', error);
      throw error;
    }
  }
}
