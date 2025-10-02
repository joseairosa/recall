import { MemoryStore } from '../redis/memory-store.js';
import type { MemoryEntry } from '../types.js';

export interface AnalyticsData {
  overview: {
    total_memories: number;
    by_type: Record<string, number>;
    total_sessions: number;
    important_count: number;
    workspace_path: string;
  };
  trends: {
    memories_last_24h: number;
    memories_last_7d: number;
    memories_last_30d: number;
    most_active_types_24h: Array<{ type: string; count: number }>;
  };
  top_tags: Array<{ tag: string; count: number }>;
  importance_distribution: {
    critical: number; // 9-10
    high: number; // 7-8
    medium: number; // 5-6
    low: number; // 1-4
  };
  recent_activity: Array<{
    date: string;
    count: number;
    types: Record<string, number>;
  }>;
}

export async function getAnalytics(workspacePath?: string): Promise<string> {
  const store = new MemoryStore(workspacePath);

  // Get summary stats
  const stats = await store.getSummaryStats();

  // Get recent memories for trend analysis
  const recentMemories = await store.getRecentMemories(1000);

  // Calculate time-based trends
  const now = Date.now();
  const day24h = now - 24 * 60 * 60 * 1000;
  const day7d = now - 7 * 24 * 60 * 60 * 1000;
  const day30d = now - 30 * 24 * 60 * 60 * 1000;

  const memories24h = recentMemories.filter(m => m.timestamp >= day24h);
  const memories7d = recentMemories.filter(m => m.timestamp >= day7d);
  const memories30d = recentMemories.filter(m => m.timestamp >= day30d);

  // Most active types in last 24h
  const typeCount24h = new Map<string, number>();
  for (const memory of memories24h) {
    typeCount24h.set(memory.context_type, (typeCount24h.get(memory.context_type) || 0) + 1);
  }
  const mostActiveTypes24h = Array.from(typeCount24h.entries())
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // Tag frequency
  const tagCount = new Map<string, number>();
  for (const memory of recentMemories) {
    for (const tag of memory.tags) {
      tagCount.set(tag, (tagCount.get(tag) || 0) + 1);
    }
  }
  const topTags = Array.from(tagCount.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Importance distribution
  const importanceDist = {
    critical: recentMemories.filter(m => m.importance >= 9).length,
    high: recentMemories.filter(m => m.importance >= 7 && m.importance < 9).length,
    medium: recentMemories.filter(m => m.importance >= 5 && m.importance < 7).length,
    low: recentMemories.filter(m => m.importance < 5).length,
  };

  // Recent activity by day (last 7 days)
  const activityByDay = new Map<string, { count: number; types: Map<string, number> }>();
  const last7Days = [];
  for (let i = 6; i >= 0; i--) {
    const date = new Date(now - i * 24 * 60 * 60 * 1000);
    const dateStr = date.toISOString().split('T')[0];
    last7Days.push(dateStr);
    activityByDay.set(dateStr, { count: 0, types: new Map() });
  }

  for (const memory of memories7d) {
    const dateStr = new Date(memory.timestamp).toISOString().split('T')[0];
    const activity = activityByDay.get(dateStr);
    if (activity) {
      activity.count++;
      activity.types.set(memory.context_type, (activity.types.get(memory.context_type) || 0) + 1);
    }
  }

  const recentActivity = last7Days.map(date => {
    const activity = activityByDay.get(date)!;
    return {
      date,
      count: activity.count,
      types: Object.fromEntries(activity.types),
    };
  });

  // Build analytics data
  const analytics: AnalyticsData = {
    overview: stats,
    trends: {
      memories_last_24h: memories24h.length,
      memories_last_7d: memories7d.length,
      memories_last_30d: memories30d.length,
      most_active_types_24h: mostActiveTypes24h,
    },
    top_tags: topTags,
    importance_distribution: importanceDist,
    recent_activity: recentActivity,
  };

  // Format as readable text
  return formatAnalytics(analytics);
}

function formatAnalytics(data: AnalyticsData): string {
  const lines = [
    '# Memory Analytics Dashboard',
    '',
    `**Workspace**: ${data.overview.workspace_path}`,
    '',
    '## Overview',
    `- Total Memories: ${data.overview.total_memories}`,
    `- Sessions: ${data.overview.total_sessions}`,
    `- Important Memories (≥8): ${data.overview.important_count}`,
    '',
    '### Memories by Type',
  ];

  for (const [type, count] of Object.entries(data.overview.by_type)) {
    if (count > 0) {
      lines.push(`- ${type}: ${count}`);
    }
  }

  lines.push('', '## Recent Activity Trends');
  lines.push(`- Last 24 hours: ${data.trends.memories_last_24h} memories`);
  lines.push(`- Last 7 days: ${data.trends.memories_last_7d} memories`);
  lines.push(`- Last 30 days: ${data.trends.memories_last_30d} memories`);

  if (data.trends.most_active_types_24h.length > 0) {
    lines.push('', '### Most Active Types (24h)');
    for (const { type, count } of data.trends.most_active_types_24h) {
      lines.push(`- ${type}: ${count}`);
    }
  }

  if (data.top_tags.length > 0) {
    lines.push('', '## Top Tags');
    for (const { tag, count } of data.top_tags) {
      lines.push(`- ${tag}: ${count}`);
    }
  }

  lines.push('', '## Importance Distribution');
  lines.push(`- Critical (9-10): ${data.importance_distribution.critical}`);
  lines.push(`- High (7-8): ${data.importance_distribution.high}`);
  lines.push(`- Medium (5-6): ${data.importance_distribution.medium}`);
  lines.push(`- Low (1-4): ${data.importance_distribution.low}`);

  lines.push('', '## Activity Last 7 Days');
  for (const activity of data.recent_activity) {
    const typeSummary = Object.entries(activity.types)
      .map(([type, count]) => `${type}:${count}`)
      .join(', ');
    lines.push(`- ${activity.date}: ${activity.count} memories ${typeSummary ? `(${typeSummary})` : ''}`);
  }

  return lines.join('\n');
}
