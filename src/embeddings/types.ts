/**
 * Embedding Provider Types
 *
 * Defines the interface for embedding providers, allowing pluggable
 * support for different AI services.
 *
 * Supported providers:
 * - Voyage AI: Best retrieval quality (Stanford research)
 * - Cohere: Highest MTEB benchmark, multilingual
 * - OpenAI: Native embeddings API, widely adopted
 * - Anthropic: Keyword extraction + trigrams (no native embeddings)
 * - Deepseek: OpenAI-compatible API
 * - Grok (xAI): OpenAI-compatible API
 * - Ollama: Local models
 */

/**
 * Supported embedding providers
 */
export type EmbeddingProviderType = 'voyage' | 'cohere' | 'openai' | 'anthropic' | 'deepseek' | 'grok' | 'ollama';

/**
 * Configuration for embedding providers
 */
export interface EmbeddingProviderConfig {
  provider: EmbeddingProviderType;

  // Provider-specific settings
  apiKey?: string;
  model?: string;
  baseUrl?: string; // For Ollama or custom endpoints
  dimensions?: number;
}

/**
 * Result from embedding generation
 */
export interface EmbeddingResult {
  embedding: number[];
  model: string;
  dimensions: number;
  tokenCount?: number;
}

/**
 * Interface that all embedding providers must implement
 */
export interface EmbeddingProvider {
  /**
   * Provider name for logging/identification
   */
  readonly name: EmbeddingProviderType;

  /**
   * Dimensions of the embedding vectors produced
   */
  readonly dimensions: number;

  /**
   * Generate embedding for a single text
   */
  generateEmbedding(text: string): Promise<number[]>;

  /**
   * Generate embeddings for multiple texts (batch operation)
   */
  generateEmbeddings(texts: string[]): Promise<number[][]>;

  /**
   * Check if the provider is properly configured
   */
  isConfigured(): boolean;
}

/**
 * Default provider configurations
 */
export const DEFAULT_PROVIDER_CONFIGS: Record<EmbeddingProviderType, Partial<EmbeddingProviderConfig>> = {
  // Premium providers (best quality)
  voyage: {
    model: 'voyage-3-large', // Best retrieval quality, Stanford research
    baseUrl: 'https://api.voyageai.com/v1',
    dimensions: 1536,
  },
  cohere: {
    model: 'embed-v4.0', // Highest MTEB benchmark, multilingual
    baseUrl: 'https://api.cohere.com/v2',
    dimensions: 1024,
  },
  openai: {
    model: 'text-embedding-3-small', // Good balance of quality/cost
    baseUrl: 'https://api.openai.com/v1',
    dimensions: 1536,
  },
  // Alternative providers
  anthropic: {
    model: 'claude-3-5-haiku-20241022',
    dimensions: 128, // Our custom vector size (no native embeddings)
  },
  deepseek: {
    model: 'deepseek-chat',
    baseUrl: 'https://api.deepseek.com/v1',
    dimensions: 1536,
  },
  grok: {
    model: 'grok-2',
    baseUrl: 'https://api.x.ai/v1',
    dimensions: 1536,
  },
  // Self-hosted
  ollama: {
    model: 'nomic-embed-text',
    baseUrl: 'http://localhost:11434',
    dimensions: 768,
  },
};
