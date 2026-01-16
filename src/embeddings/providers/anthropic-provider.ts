/**
 * Anthropic Embedding Provider
 *
 * Uses Claude to extract semantic keywords and combines them with
 * character trigrams to create a lightweight embedding vector.
 *
 * Note: Anthropic doesn't have a native embeddings API, so this is
 * a workaround that provides reasonable semantic similarity.
 */

import Anthropic from '@anthropic-ai/sdk';
import {
  EmbeddingProvider,
  EmbeddingProviderConfig,
  DEFAULT_PROVIDER_CONFIGS,
} from '../types.js';

export class AnthropicProvider implements EmbeddingProvider {
  readonly name = 'anthropic' as const;
  readonly dimensions: number;

  private client: Anthropic | null = null;
  private model: string;
  private apiKey?: string;

  constructor(config?: Partial<EmbeddingProviderConfig>) {
    const defaults = DEFAULT_PROVIDER_CONFIGS.anthropic;
    this.model = config?.model ?? defaults.model ?? 'claude-3-5-haiku-20241022';
    this.dimensions = config?.dimensions ?? defaults.dimensions ?? 128;
    this.apiKey = config?.apiKey ?? process.env.ANTHROPIC_API_KEY;
  }

  isConfigured(): boolean {
    return !!(this.apiKey || process.env.ANTHROPIC_API_KEY);
  }

  private getClient(): Anthropic {
    if (!this.client) {
      const apiKey = this.apiKey ?? process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        throw new Error('ANTHROPIC_API_KEY environment variable is required for Anthropic provider');
      }
      this.client = new Anthropic({ apiKey });
    }
    return this.client;
  }

  async generateEmbedding(text: string): Promise<number[]> {
    try {
      const keywords = await this.generateSemanticFingerprint(text);
      return this.createSimpleVector(text, keywords);
    } catch (error) {
      console.error('[AnthropicProvider] Error generating embedding:', error);
      throw error;
    }
  }

  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    try {
      const embeddings = await Promise.all(
        texts.map(text => this.generateEmbedding(text))
      );
      return embeddings;
    } catch (error) {
      console.error('[AnthropicProvider] Error generating embeddings:', error);
      throw error;
    }
  }

  /**
   * Use Claude to extract semantic keywords from text
   */
  private async generateSemanticFingerprint(text: string): Promise<string[]> {
    try {
      const client = this.getClient();
      const response = await client.messages.create({
        model: this.model,
        max_tokens: 200,
        messages: [{
          role: 'user',
          content: `Extract 5-10 key concepts/keywords from this text. Return ONLY a comma-separated list, no explanations:

${text}`
        }]
      });

      const content = response.content[0];
      if (content.type === 'text') {
        const keywords = content.text
          .split(',')
          .map(k => k.trim().toLowerCase())
          .filter(k => k.length > 0);
        return keywords;
      }

      return [];
    } catch (error) {
      console.error('[AnthropicProvider] Error generating semantic fingerprint:', error);
      throw error;
    }
  }

  /**
   * Create a vector from text and semantic keywords
   */
  private createSimpleVector(text: string, keywords: string[]): number[] {
    const vector = new Array(this.dimensions).fill(0);
    const normalized = text.toLowerCase();
    const halfDim = Math.floor(this.dimensions / 2);

    // Part 1: Character trigrams (first half)
    const trigrams = this.extractTrigrams(normalized);
    for (let i = 0; i < Math.min(trigrams.length, halfDim); i++) {
      const hash = this.simpleHash(trigrams[i]);
      const index = hash % halfDim;
      vector[index] += 1;
    }

    // Part 2: Keyword-based features (second half)
    for (const keyword of keywords) {
      const hash = this.simpleHash(keyword);
      const index = halfDim + (hash % halfDim);
      vector[index] += 2; // Weight keywords higher
    }

    // Normalize the vector
    const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
    if (magnitude > 0) {
      for (let i = 0; i < vector.length; i++) {
        vector[i] /= magnitude;
      }
    }

    return vector;
  }

  private extractTrigrams(text: string): string[] {
    const trigrams: string[] = [];
    for (let i = 0; i < text.length - 2; i++) {
      trigrams.push(text.substring(i, i + 3));
    }
    return trigrams;
  }

  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }
}
