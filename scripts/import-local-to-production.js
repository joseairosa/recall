#!/usr/bin/env node
/**
 * Import memories from local Redis to production Recall SaaS
 *
 * Usage: node scripts/import-local-to-production.js
 *
 * Requires:
 * - Local Redis running with memories
 * - RECALL_API_KEY environment variable set
 */

import Redis from 'ioredis';

const PRODUCTION_URL = 'https://recallmcp.com/api/memories';
const API_KEY = process.env.RECALL_API_KEY;

if (!API_KEY) {
  console.error('ERROR: RECALL_API_KEY environment variable required');
  console.error('Usage: RECALL_API_KEY=sk-xxx node scripts/import-local-to-production.js');
  process.exit(1);
}

async function main() {
  console.log('Connecting to local Redis...');
  const redis = new Redis('redis://localhost:6379');

  // Get all actual memory keys (not :category, :versions, etc.)
  console.log('Fetching memory keys...');
  const allKeys = await redis.keys('ws:*:memory:*');
  const memoryKeys = allKeys.filter(key => {
    const parts = key.split(':');
    return parts.length === 4 && parts[2] === 'memory';
  });

  console.log(`Found ${memoryKeys.length} memories to import`);

  let imported = 0;
  let failed = 0;
  let skipped = 0;

  for (const key of memoryKeys) {
    try {
      const data = await redis.hgetall(key);

      if (!data.content) {
        console.log(`  SKIP: ${key} - no content`);
        skipped++;
        continue;
      }

      // Prepare memory for import
      const memory = {
        content: data.content,
        context_type: data.context_type || 'information',
        importance: parseInt(data.importance) || 5,
        tags: data.tags ? JSON.parse(data.tags) : [],
      };

      // Add summary to content if exists
      if (data.summary && data.summary !== data.content) {
        memory.content = `${data.content}\n\nSummary: ${data.summary}`;
      }

      // POST to production
      const response = await fetch(PRODUCTION_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${API_KEY}`,
        },
        body: JSON.stringify(memory),
      });

      if (response.ok) {
        imported++;
        if (imported % 50 === 0) {
          console.log(`  Progress: ${imported}/${memoryKeys.length} imported`);
        }
      } else {
        const error = await response.text();
        console.error(`  FAIL: ${key} - ${response.status}: ${error}`);
        failed++;
      }

      // Small delay to avoid rate limiting
      await new Promise(r => setTimeout(r, 50));

    } catch (error) {
      console.error(`  ERROR: ${key} - ${error.message}`);
      failed++;
    }
  }

  console.log('\n=== Import Complete ===');
  console.log(`  Imported: ${imported}`);
  console.log(`  Failed: ${failed}`);
  console.log(`  Skipped: ${skipped}`);
  console.log(`  Total: ${memoryKeys.length}`);

  await redis.quit();
}

main().catch(console.error);
