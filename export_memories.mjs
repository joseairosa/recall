import Redis from 'ioredis';

async function exportAll() {
  const client = new Redis('redis://localhost:6379');
  
  const keys = await client.keys('ws:*:memory:*');
  // Filter out non-memory keys (versions, relationships, categories, etc.)
  const memoryKeys = keys.filter(k => {
    if (k.includes(':versions')) return false;
    if (k.includes(':version:')) return false;
    if (k.includes(':category')) return false;
    if (k.includes(':relationships')) return false;
    // Should be exactly ws:{workspace}:memory:{id}
    const parts = k.split(':');
    return parts.length === 4 && parts[0] === 'ws' && parts[2] === 'memory';
  });
  
  console.error(`Found ${memoryKeys.length} memories to export`);
  
  const memories = [];
  let count = 0;
  let errors = 0;
  
  for (const key of memoryKeys) {
    try {
      const data = await client.hgetall(key);
      if (data && data.content) {
        const match = key.match(/ws:([^:]+):memory:(.+)/);
        if (match) {
          let tags = [];
          try { tags = data.tags ? JSON.parse(data.tags) : []; } catch(e) {}
          
          memories.push({
            id: match[2],
            workspace_id: match[1],
            content: data.content,
            context_type: data.context_type || 'information',
            importance: parseInt(data.importance) || 5,
            timestamp: parseInt(data.timestamp) || Date.now(),
            summary: data.summary || null,
            tags: tags,
            is_global: data.is_global === 'true'
          });
          count++;
          if (count % 100 === 0) console.error(`Exported ${count}/${memoryKeys.length}`);
        }
      }
    } catch (e) {
      errors++;
      console.error(`Error on key ${key}: ${e.message}`);
    }
  }
  
  await client.quit();
  
  console.error(`\nExported ${memories.length} memories with ${errors} errors`);
  
  const output = {
    version: '1.2.0',
    exported_at: Date.now(),
    memory_count: memories.length,
    memories: memories
  };
  
  console.log(JSON.stringify(output));
}

exportAll().catch(console.error);
