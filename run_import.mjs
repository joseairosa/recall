import fs from 'fs';
import https from 'https';

const API_KEY = 'REDACTED_API_KEY';

// Use REST API /api/memories instead of MCP
async function storeMemory(memory) {
  const requestBody = JSON.stringify({
    content: memory.content,
    context_type: memory.context_type,
    importance: memory.importance,
    summary: memory.summary,
    tags: memory.tags,
    is_global: memory.is_global
  });

  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'recallmcp.com',
      port: 443,
      path: '/api/memories',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Length': Buffer.byteLength(requestBody)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200 || res.statusCode === 201) {
          resolve({ success: true, response: data });
        } else {
          resolve({ success: false, status: res.statusCode, response: data });
        }
      });
    });

    req.on('error', (e) => reject(e));
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.write(requestBody);
    req.end();
  });
}

async function main() {
  const data = JSON.parse(fs.readFileSync('/tmp/all_memories.json', 'utf-8'));
  const memories = data.memories;

  console.log(`Importing ${memories.length} memories to recallmcp.com...`);

  let success = 0;
  let failed = 0;

  for (let i = 0; i < memories.length; i++) {
    const memory = memories[i];

    try {
      const result = await storeMemory(memory);
      if (result.success) {
        success++;
      } else {
        failed++;
        if (failed <= 5) {
          console.log(`  ✗ Memory ${i}: ${result.status} - ${result.response.substring(0, 200)}`);
        }
      }
    } catch (e) {
      failed++;
      if (failed <= 5) {
        console.log(`  ✗ Memory ${i}: ${e.message}`);
      }
    }

    if ((i + 1) % 100 === 0) {
      console.log(`Progress: ${i + 1}/${memories.length} (${success} success, ${failed} failed)`);
    }

    // Small delay to avoid rate limiting
    await new Promise(r => setTimeout(r, 50));
  }

  console.log(`\nDone: ${success} success, ${failed} failed`);
}

main().catch(console.error);
