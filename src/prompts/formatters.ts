import type { MemoryEntry } from '../types.js';

/**
 * Format workspace context for Claude to read
 */
export function formatWorkspaceContext(
  workspacePath: string,
  directives: MemoryEntry[],
  decisions: MemoryEntry[],
  patterns: MemoryEntry[]
): string {
  const sections: string[] = [];

  // Header
  sections.push(`# Workspace Context: ${workspacePath}`);
  sections.push('');
  sections.push('*Critical information to remember for this project*');
  sections.push('');

  // Directives (sorted by importance)
  if (directives.length > 0) {
    sections.push('## 🎯 Critical Directives');
    sections.push('');
    const sorted = directives.sort((a, b) => b.importance - a.importance);
    for (const dir of sorted.slice(0, 10)) {
      sections.push(`- **[Importance: ${dir.importance}/10]** ${dir.content}`);
      if (dir.tags.length > 0) {
        sections.push(`  *Tags: ${dir.tags.join(', ')}*`);
      }
    }
    sections.push('');
  }

  // Decisions (sorted by importance)
  if (decisions.length > 0) {
    sections.push('## 💡 Key Decisions');
    sections.push('');
    const sorted = decisions.sort((a, b) => b.importance - a.importance);
    for (const dec of sorted.slice(0, 8)) {
      const age = getAgeString(dec.timestamp);
      sections.push(`- **[${age}]** ${dec.content}`);
    }
    sections.push('');
  }

  // Code Patterns (sorted by importance)
  if (patterns.length > 0) {
    sections.push('## 🔧 Code Patterns & Conventions');
    sections.push('');
    const sorted = patterns.sort((a, b) => b.importance - a.importance);
    for (const pat of sorted.slice(0, 8)) {
      sections.push(`- ${pat.content}`);
      if (pat.tags.length > 0) {
        sections.push(`  *Applies to: ${pat.tags.join(', ')}*`);
      }
    }
    sections.push('');
  }

  if (directives.length === 0 && decisions.length === 0 && patterns.length === 0) {
    sections.push('*No critical context stored yet. As we work, I\'ll remember important patterns and decisions.*');
  }

  sections.push('');
  sections.push('---');
  sections.push('*This context is automatically injected to help me remember important project conventions and decisions.*');

  return sections.join('\n');
}

/**
 * Format memories for concise display
 */
export function formatMemoriesCompact(memories: MemoryEntry[]): string {
  if (memories.length === 0) {
    return '*No relevant memories found*';
  }

  const lines: string[] = [];

  for (const mem of memories) {
    const age = getAgeString(mem.timestamp);
    const importance = '★'.repeat(Math.min(mem.importance, 5));
    lines.push(`[${age}] ${importance} ${mem.summary || mem.content.substring(0, 80)}`);
  }

  return lines.join('\n');
}

/**
 * Get human-readable age string
 */
function getAgeString(timestamp: number): string {
  const ageMs = Date.now() - timestamp;
  const ageMinutes = Math.floor(ageMs / (1000 * 60));
  const ageHours = Math.floor(ageMs / (1000 * 60 * 60));
  const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));

  if (ageDays > 0) {
    return `${ageDays}d ago`;
  } else if (ageHours > 0) {
    return `${ageHours}h ago`;
  } else if (ageMinutes > 0) {
    return `${ageMinutes}m ago`;
  } else {
    return 'just now';
  }
}
