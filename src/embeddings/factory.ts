/**
 * Embedding Provider Factory
 *
 * Creates the appropriate embedding provider based on configuration
 * and available API keys.
 *
 * Priority order for auto-detection (best quality first):
 * 1. Voyage AI (VOYAGE_API_KEY) - Best retrieval quality
 * 2. Cohere (COHERE_API_KEY) - Highest MTEB benchmark
 * 3. OpenAI (OPENAI_API_KEY) - Good balance, widely adopted
 * 4. Deepseek (DEEPSEEK_API_KEY)
 * 5. Grok (GROK_API_KEY)
 * 6. Anthropic (ANTHROPIC_API_KEY) - Fallback (keyword-based)
 *
 * Environment variables:
 * - EMBEDDING_PROVIDER: Force a specific provider
 * - VOYAGE_API_KEY: For Voyage AI (best quality)
 * - COHERE_API_KEY: For Cohere (multilingual)
 * - OPENAI_API_KEY: For OpenAI
 * - ANTHROPIC_API_KEY: For Anthropic
 * - DEEPSEEK_API_KEY: For Deepseek
 * - GROK_API_KEY: For Grok/xAI
 * - OLLAMA_BASE_URL: For local Ollama
 */

import {
  EmbeddingProvider,
  EmbeddingProviderType,
  EmbeddingProviderConfig,
} from './types.js';
import { VoyageProvider } from './providers/voyage-provider.js';
import { CohereProvider } from './providers/cohere-provider.js';
import { AnthropicProvider } from './providers/anthropic-provider.js';
import { OpenAICompatibleProvider } from './providers/openai-compatible-provider.js';
import { OllamaProvider } from './providers/ollama-provider.js';

// Singleton provider instance
let currentProvider: EmbeddingProvider | null = null;
let currentProviderType: EmbeddingProviderType | null = null;

/**
 * Valid provider types for validation
 */
const VALID_PROVIDERS: EmbeddingProviderType[] = [
  'voyage', 'cohere', 'openai', 'anthropic', 'deepseek', 'grok', 'ollama'
];

/**
 * Get the configured embedding provider type from environment
 */
function getConfiguredProviderType(): EmbeddingProviderType | null {
  const configured = process.env.EMBEDDING_PROVIDER?.toLowerCase();
  if (configured && VALID_PROVIDERS.includes(configured as EmbeddingProviderType)) {
    return configured as EmbeddingProviderType;
  }
  return null;
}

/**
 * Auto-detect provider based on available API keys
 * Priority: Voyage > Cohere > OpenAI > Deepseek > Grok > Anthropic
 */
function detectProviderFromApiKeys(): EmbeddingProviderType {
  // Premium providers first (best quality)
  if (process.env.VOYAGE_API_KEY) {
    console.log('[EmbeddingFactory] Auto-detected Voyage AI from VOYAGE_API_KEY (best quality)');
    return 'voyage';
  }
  if (process.env.COHERE_API_KEY) {
    console.log('[EmbeddingFactory] Auto-detected Cohere from COHERE_API_KEY (multilingual)');
    return 'cohere';
  }
  if (process.env.OPENAI_API_KEY) {
    console.log('[EmbeddingFactory] Auto-detected OpenAI from OPENAI_API_KEY');
    return 'openai';
  }
  if (process.env.DEEPSEEK_API_KEY) {
    console.log('[EmbeddingFactory] Auto-detected Deepseek from DEEPSEEK_API_KEY');
    return 'deepseek';
  }
  if (process.env.GROK_API_KEY) {
    console.log('[EmbeddingFactory] Auto-detected Grok from GROK_API_KEY');
    return 'grok';
  }
  if (process.env.ANTHROPIC_API_KEY) {
    console.log('[EmbeddingFactory] Auto-detected Anthropic from ANTHROPIC_API_KEY (keyword-based fallback)');
    return 'anthropic';
  }

  // Default to Anthropic (original behavior, will fail if no key)
  console.log('[EmbeddingFactory] No API keys detected, defaulting to Anthropic');
  return 'anthropic';
}

/**
 * Create a provider instance for the given type
 */
function createProviderInstance(
  type: EmbeddingProviderType,
  config?: Partial<EmbeddingProviderConfig>
): EmbeddingProvider {
  switch (type) {
    case 'voyage':
      return new VoyageProvider(config);
    case 'cohere':
      return new CohereProvider(config);
    case 'openai':
      return new OpenAICompatibleProvider('openai', config);
    case 'deepseek':
      return new OpenAICompatibleProvider('deepseek', config);
    case 'grok':
      return new OpenAICompatibleProvider('grok', config);
    case 'anthropic':
      return new AnthropicProvider(config);
    case 'ollama':
      return new OllamaProvider(config);
    default:
      throw new Error(`Unknown embedding provider: ${type}`);
  }
}

/**
 * Get the current embedding provider (creates one if needed)
 */
export function getEmbeddingProvider(config?: Partial<EmbeddingProviderConfig>): EmbeddingProvider {
  // Determine provider type
  const requestedType = config?.provider ?? getConfiguredProviderType() ?? detectProviderFromApiKeys();

  // Reuse existing provider if same type
  if (currentProvider && currentProviderType === requestedType) {
    return currentProvider;
  }

  // Create new provider
  console.log(`[EmbeddingFactory] Creating ${requestedType} embedding provider`);
  currentProvider = createProviderInstance(requestedType, config);
  currentProviderType = requestedType;

  // Verify configuration
  if (!currentProvider.isConfigured()) {
    console.warn(`[EmbeddingFactory] Warning: ${requestedType} provider may not be properly configured`);
  }

  return currentProvider;
}

/**
 * Reset the current provider (useful for testing or reconfiguration)
 */
export function resetEmbeddingProvider(): void {
  currentProvider = null;
  currentProviderType = null;
}

/**
 * Get information about the current provider
 */
export function getProviderInfo(): {
  type: EmbeddingProviderType | null;
  dimensions: number | null;
  configured: boolean;
} {
  if (!currentProvider) {
    return {
      type: null,
      dimensions: null,
      configured: false,
    };
  }

  return {
    type: currentProviderType,
    dimensions: currentProvider.dimensions,
    configured: currentProvider.isConfigured(),
  };
}

/**
 * List all available providers and their configuration status
 */
export function listAvailableProviders(): Array<{
  type: EmbeddingProviderType;
  configured: boolean;
  envVar: string;
  quality: 'premium' | 'standard' | 'fallback';
}> {
  return [
    {
      type: 'voyage',
      configured: !!process.env.VOYAGE_API_KEY,
      envVar: 'VOYAGE_API_KEY',
      quality: 'premium',
    },
    {
      type: 'cohere',
      configured: !!process.env.COHERE_API_KEY,
      envVar: 'COHERE_API_KEY',
      quality: 'premium',
    },
    {
      type: 'openai',
      configured: !!process.env.OPENAI_API_KEY,
      envVar: 'OPENAI_API_KEY',
      quality: 'standard',
    },
    {
      type: 'deepseek',
      configured: !!process.env.DEEPSEEK_API_KEY,
      envVar: 'DEEPSEEK_API_KEY',
      quality: 'standard',
    },
    {
      type: 'grok',
      configured: !!process.env.GROK_API_KEY,
      envVar: 'GROK_API_KEY',
      quality: 'standard',
    },
    {
      type: 'anthropic',
      configured: !!process.env.ANTHROPIC_API_KEY,
      envVar: 'ANTHROPIC_API_KEY',
      quality: 'fallback',
    },
    {
      type: 'ollama',
      configured: true, // Always available if Ollama is running
      envVar: 'OLLAMA_BASE_URL (optional)',
      quality: 'standard',
    },
  ];
}
