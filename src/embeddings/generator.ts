/**
 * Embedding Generator
 *
 * Provides a unified interface for generating embeddings using any
 * supported AI provider (OpenAI, Anthropic, Deepseek, Grok, Ollama).
 *
 * Provider selection:
 * 1. Set EMBEDDING_PROVIDER env var: 'openai' | 'anthropic' | 'deepseek' | 'grok' | 'ollama'
 * 2. Or auto-detect based on available API keys (priority: OpenAI > Deepseek > Grok > Anthropic)
 *
 * API Keys:
 * - OPENAI_API_KEY: For OpenAI embeddings (recommended, 1536 dimensions)
 * - ANTHROPIC_API_KEY: For Anthropic (128 dimensions, keyword-based)
 * - DEEPSEEK_API_KEY: For Deepseek (1536 dimensions)
 * - GROK_API_KEY: For xAI Grok (1536 dimensions)
 */

import { getEmbeddingProvider, getProviderInfo, listAvailableProviders } from './factory.js';

/**
 * Generate embedding for a single text
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const provider = getEmbeddingProvider();
  return provider.generateEmbedding(text);
}

/**
 * Generate embeddings for multiple texts (batch operation)
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const provider = getEmbeddingProvider();
  return provider.generateEmbeddings(texts);
}

/**
 * Get the dimensions of the current embedding provider
 */
export function getEmbeddingDimensions(): number {
  const provider = getEmbeddingProvider();
  return provider.dimensions;
}

/**
 * Cosine similarity calculation between two vectors
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    // Handle dimension mismatch gracefully
    // This can happen if switching providers with different dimensions
    console.warn(`[Embeddings] Vector dimension mismatch: ${a.length} vs ${b.length}`);

    // Pad shorter vector with zeros or truncate longer one
    const targetLength = Math.min(a.length, b.length);
    a = a.slice(0, targetLength);
    b = b.slice(0, targetLength);
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  if (magnitude === 0) return 0;

  return dotProduct / magnitude;
}

// Re-export factory functions for advanced usage
export { getEmbeddingProvider, getProviderInfo, listAvailableProviders };
