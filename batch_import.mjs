import fs from 'fs';

const data = JSON.parse(fs.readFileSync('/tmp/all_memories.json', 'utf-8'));
const memories = data.memories;
const batchSize = 50;  // 50 memories per batch
const batches = [];

for (let i = 0; i < memories.length; i += batchSize) {
  const batch = memories.slice(i, i + batchSize);
  batches.push({
    version: '1.2.0',
    exported_at: Date.now(),
    memory_count: batch.length,
    memories: batch
  });
}

console.log(`Created ${batches.length} batches of ${batchSize} memories each`);

// Save batches to files
for (let i = 0; i < batches.length; i++) {
  const batchFile = `/tmp/batch_${String(i).padStart(3, '0')}.json`;
  fs.writeFileSync(batchFile, JSON.stringify(batches[i]));
  console.log(`Saved ${batchFile}`);
}
