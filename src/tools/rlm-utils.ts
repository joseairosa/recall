/**
 * RLM utility helpers shared by rlm-process-tool and rlm-tools.
 */

/**
 * Heuristically suggest a decomposition strategy based on content and task.
 */
export function detectSuggestedStrategy(
  content: string,
  task: string,
): "filter" | "aggregate" | "recursive" | "chunk" {
  const taskLower = task.toLowerCase();

  if (
    taskLower.includes("summar") ||
    taskLower.includes("aggregat") ||
    taskLower.includes("overview") ||
    taskLower.includes("combine all")
  ) {
    return "aggregate";
  }

  if (
    taskLower.includes("find") ||
    taskLower.includes("filter") ||
    taskLower.includes("search") ||
    taskLower.includes("extract") ||
    taskLower.includes("grep")
  ) {
    return "filter";
  }

  if (content.length > 50000) {
    return "recursive";
  }

  return "chunk";
}
