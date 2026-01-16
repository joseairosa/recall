/**
 * Embedding Providers Index
 *
 * Re-exports all provider implementations for easy access.
 *
 * Quality Ranking (based on MTEB 2025):
 * 1. Voyage AI - Best retrieval quality (Stanford research)
 * 2. Cohere - Highest benchmark, multilingual
 * 3. OpenAI - Good balance, widely adopted
 */

// Premium providers (best quality)
export { VoyageProvider } from './voyage-provider.js';
export { CohereProvider } from './cohere-provider.js';

// Standard providers
export { AnthropicProvider } from './anthropic-provider.js';
export {
  OpenAICompatibleProvider,
  createOpenAIProvider,
  createDeepseekProvider,
  createGrokProvider,
} from './openai-compatible-provider.js';

// Self-hosted
export { OllamaProvider } from './ollama-provider.js';
