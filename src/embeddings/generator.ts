import { query } from '@anthropic-ai/claude-agent-sdk';

// Claude doesn't have a native embeddings API, so we'll use a lightweight approach:
// Generate a semantic "fingerprint" by having Claude extract key concepts
async function generateSemanticFingerprint(text: string): Promise<string[]> {
  try {
    const prompt = `Extract 5-10 key concepts/keywords from this text. Return ONLY a comma-separated list, no explanations:

${text}`;

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

    // Parse comma-separated keywords
    const keywords = responseText
      .split(',')
      .map(k => k.trim().toLowerCase())
      .filter(k => k.length > 0);

    return keywords;
  } catch (error) {
    console.error('Error generating semantic fingerprint:', error);
    throw error;
  }
}

// Convert text to a simple vector representation using character n-grams and keywords
export async function generateEmbedding(text: string): Promise<number[]> {
  try {
    // Get semantic keywords from Claude
    const keywords = await generateSemanticFingerprint(text);

    // Create a simple vector representation
    // This is a lightweight approach that combines:
    // 1. Character trigrams (for text similarity)
    // 2. Semantic keywords (from Claude)
    const vector = createSimpleVector(text, keywords);

    return vector;
  } catch (error) {
    console.error('Error generating embedding:', error);
    throw error;
  }
}

export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  try {
    // Process in parallel
    const embeddings = await Promise.all(
      texts.map(text => generateEmbedding(text))
    );
    return embeddings;
  } catch (error) {
    console.error('Error generating embeddings:', error);
    throw error;
  }
}

// Create a simple 128-dimensional vector from text and keywords
function createSimpleVector(text: string, keywords: string[]): number[] {
  const VECTOR_SIZE = 128;
  const vector = new Array(VECTOR_SIZE).fill(0);

  // Normalize text
  const normalized = text.toLowerCase();

  // Part 1: Character trigrams (first 64 dimensions)
  const trigrams = extractTrigrams(normalized);
  for (let i = 0; i < Math.min(trigrams.length, 64); i++) {
    const hash = simpleHash(trigrams[i]);
    const index = hash % 64;
    vector[index] += 1;
  }

  // Part 2: Keyword-based features (last 64 dimensions)
  for (const keyword of keywords) {
    const hash = simpleHash(keyword);
    const index = 64 + (hash % 64);
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

// Extract character trigrams from text
function extractTrigrams(text: string): string[] {
  const trigrams: string[] = [];
  for (let i = 0; i < text.length - 2; i++) {
    trigrams.push(text.substring(i, i + 3));
  }
  return trigrams;
}

// Simple hash function
function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

// Cosine similarity calculation
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have the same length');
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}
