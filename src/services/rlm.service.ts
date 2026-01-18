/**
 * RLMService - RLM (Recursive Language Model) Service
 *
 * Handles business logic for RLM execution chains, following SRP.
 * This service encapsulates all RLM-related operations, keeping the
 * tool handlers thin and focused on input/output transformation.
 *
 * Responsibilities:
 * - Creating and managing execution contexts
 * - Decomposing tasks into subtasks
 * - Extracting context snippets
 * - Merging and verifying results
 *
 * Architecture:
 * - Uses MemoryStore for persistence (dependency injection)
 * - Stateless service - all state is in MemoryStore
 * - Pure business logic - no MCP response formatting
 *
 * @version 1.8.0
 */

import { MemoryStore } from '../persistence/memory-store.js';
import {
  type ExecutionContext,
  type Subtask,
  type SubtaskStatus,
  type DecompositionStrategy,
  type ExecutionChainSummary,
  type ContextSnippet,
  type MergedResults,
  type VerificationResult,
  ExecutionStatus,
} from '../types.js';

/**
 * Configuration for RLM operations
 */
export interface RLMConfig {
  maxRecursionDepth: number;
  defaultChunkCount: number;
  defaultMaxTokens: number;
  verificationThreshold: number;
}

/**
 * Default RLM configuration
 */
export const DEFAULT_RLM_CONFIG: RLMConfig = {
  maxRecursionDepth: 5,
  defaultChunkCount: 5,
  defaultMaxTokens: 4000,
  verificationThreshold: 0.7,
};

/**
 * Subtask definition for decomposition
 */
export interface SubtaskDefinition {
  description: string;
  query?: string;
}

/**
 * Result of creating an execution context
 */
export interface CreateExecutionContextResult {
  chain_id: string;
  estimated_tokens: number;
  strategy: DecompositionStrategy;
  status: string;
}

/**
 * Result of decomposing a task
 */
export interface DecomposeTaskResult {
  chain_id: string;
  strategy: DecompositionStrategy;
  subtasks: Array<{
    id: string;
    order: number;
    description: string;
    query?: string;
  }>;
  next_action: string;
}

/**
 * Result of injecting context
 */
export interface InjectContextResult {
  chain_id: string;
  subtask_id: string;
  tokens_used: number;
  relevance_score: number;
  snippet: string;
}

/**
 * Result of updating subtask
 */
export interface UpdateSubtaskResult {
  subtask_id: string;
  status: SubtaskStatus;
  progress: {
    total: number;
    completed: number;
    pending: number;
    in_progress: number;
    failed: number;
  };
  all_complete: boolean;
}

/**
 * Result of merging results
 */
export interface MergeResultsServiceResult {
  chain_id: string;
  subtasks_merged: number;
  confidence: number;
  source_coverage: number;
  aggregated_result: string;
}

/**
 * RLMService - Business logic for RLM execution chains
 */
export class RLMService {
  private store: MemoryStore;
  private config: RLMConfig;

  /**
   * Creates a new RLMService instance
   * @param store - MemoryStore for persistence
   * @param config - Optional configuration override
   */
  constructor(store: MemoryStore, config: Partial<RLMConfig> = {}) {
    this.store = store;
    this.config = { ...DEFAULT_RLM_CONFIG, ...config };
  }

  // ==========================================================================
  // Execution Context Management
  // ==========================================================================

  /**
   * Creates a new execution context for processing large content
   *
   * @param task - The task description
   * @param context - The large context to process
   * @param maxDepth - Maximum recursion depth (defaults to config)
   * @returns Created execution context with analysis
   * @throws Error if context creation fails
   */
  async createExecutionContext(
    task: string,
    context: string,
    maxDepth?: number
  ): Promise<CreateExecutionContextResult> {
    const depth = maxDepth ?? this.config.maxRecursionDepth;
    const executionContext = await this.store.createExecutionContext(task, context, depth);

    return {
      chain_id: executionContext.chain_id,
      estimated_tokens: executionContext.estimated_tokens ?? 0,
      strategy: executionContext.strategy ?? 'chunk',
      status: executionContext.status,
    };
  }

  /**
   * Gets an execution context by chain ID
   *
   * @param chainId - The chain ID to retrieve
   * @returns ExecutionContext or null if not found
   */
  async getExecutionContext(chainId: string): Promise<ExecutionContext | null> {
    return this.store.getExecutionContext(chainId);
  }

  // ==========================================================================
  // Task Decomposition
  // ==========================================================================

  /**
   * Decomposes a task into subtasks based on strategy
   *
   * @param chainId - Execution chain ID
   * @param strategy - Optional strategy override
   * @param numChunks - Number of chunks (for chunk strategy)
   * @returns Decomposition result with subtasks
   * @throws Error if chain not found
   */
  async decomposeTask(
    chainId: string,
    strategy?: DecompositionStrategy,
    numChunks?: number
  ): Promise<DecomposeTaskResult> {
    const context = await this.store.getExecutionContext(chainId);
    if (!context) {
      throw new Error(`Execution chain ${chainId} not found`);
    }

    const effectiveStrategy = strategy ?? context.strategy ?? 'chunk';
    const chunkCount = numChunks ?? this.config.defaultChunkCount;

    const definitions = this.generateSubtaskDefinitions(
      context.original_task,
      effectiveStrategy,
      chunkCount
    );

    const subtasks = await this.store.createSubtasks(chainId, definitions);
    const nextAction = this.determineNextAction(
      effectiveStrategy,
      context.estimated_tokens ?? 0
    );

    return {
      chain_id: chainId,
      strategy: effectiveStrategy,
      subtasks: subtasks.map(s => ({
        id: s.id,
        order: s.order,
        description: s.description,
        query: s.query,
      })),
      next_action: nextAction,
    };
  }

  /**
   * Generates subtask definitions based on decomposition strategy
   *
   * @param task - Original task description
   * @param strategy - Decomposition strategy
   * @param numChunks - Number of chunks for chunk strategy
   * @returns Array of subtask definitions
   */
  generateSubtaskDefinitions(
    task: string,
    strategy: DecompositionStrategy,
    numChunks: number
  ): SubtaskDefinition[] {
    const taskLower = task.toLowerCase();

    switch (strategy) {
      case 'filter':
        return this.generateFilterSubtasks(taskLower);

      case 'aggregate':
        return this.generateAggregateSubtasks();

      case 'recursive':
        return this.generateRecursiveSubtasks();

      case 'chunk':
      default:
        return this.generateChunkSubtasks(numChunks);
    }
  }

  /**
   * Generates filter-based subtasks for targeted extraction
   */
  private generateFilterSubtasks(taskLower: string): SubtaskDefinition[] {
    if (taskLower.includes('error')) {
      return [
        { description: 'Find ERROR level messages', query: 'ERROR|FATAL' },
        { description: 'Find WARNING level messages', query: 'WARN|WARNING' },
        { description: 'Find exception stack traces', query: 'Exception|Traceback|at \\w+\\.' },
        { description: 'Find failure indicators', query: 'failed|failure|crash' },
        { description: 'Summarize error patterns', query: 'ERROR' },
      ];
    }

    return [
      { description: 'Extract key findings', query: 'important|critical|key|significant' },
      { description: 'Find decision points', query: 'decided|chose|selected|determined' },
      { description: 'Identify issues', query: 'issue|problem|bug|error' },
      { description: 'Find action items', query: 'todo|action|next step|follow up' },
      { description: 'Summarize conclusions', query: 'conclusion|summary|result|outcome' },
    ];
  }

  /**
   * Generates aggregate subtasks for synthesis
   */
  private generateAggregateSubtasks(): SubtaskDefinition[] {
    return [
      { description: 'Identify main themes' },
      { description: 'Extract key data points' },
      { description: 'Find patterns and trends' },
      { description: 'Note contradictions or conflicts' },
      { description: 'Synthesize overall conclusions' },
    ];
  }

  /**
   * Generates recursive subtasks for complex analysis
   */
  private generateRecursiveSubtasks(): SubtaskDefinition[] {
    return [
      { description: 'Analyze first section' },
      { description: 'Analyze middle sections' },
      { description: 'Analyze final section' },
      { description: 'Cross-reference findings' },
      { description: 'Consolidate analysis' },
    ];
  }

  /**
   * Generates chunk-based subtasks for sequential processing
   */
  private generateChunkSubtasks(numChunks: number): SubtaskDefinition[] {
    return Array.from({ length: numChunks }, (_, i) => ({
      description: `Process chunk ${i + 1} of ${numChunks}`,
      query: undefined,
    }));
  }

  /**
   * Determines the next action based on strategy and tokens
   */
  private determineNextAction(
    strategy: DecompositionStrategy,
    estimatedTokens: number
  ): string {
    if (strategy === 'recursive' && estimatedTokens > 100000) {
      return 'decompose_further';
    }
    if (strategy === 'filter') {
      return 'inject_context';
    }
    return 'execute_subtasks';
  }

  // ==========================================================================
  // Context Injection
  // ==========================================================================

  /**
   * Injects a context snippet for a subtask
   *
   * @param chainId - Execution chain ID
   * @param subtaskId - Subtask ID
   * @param query - Filter query
   * @param maxTokens - Maximum tokens for snippet
   * @returns Context injection result
   * @throws Error if chain or subtask not found
   */
  async injectContextSnippet(
    chainId: string,
    subtaskId: string,
    query: string,
    maxTokens?: number
  ): Promise<InjectContextResult> {
    // Verify chain exists
    const context = await this.store.getExecutionContext(chainId);
    if (!context) {
      throw new Error(`Execution chain ${chainId} not found`);
    }

    // Verify subtask exists
    const subtask = await this.store.getSubtask(chainId, subtaskId);
    if (!subtask) {
      throw new Error(`Subtask ${subtaskId} not found in chain ${chainId}`);
    }

    // Get context snippet
    const effectiveMaxTokens = maxTokens ?? this.config.defaultMaxTokens;
    const snippet = await this.store.getContextSnippet(chainId, query, effectiveMaxTokens);

    if (!snippet) {
      throw new Error('Could not extract snippet. Context may be empty or missing.');
    }

    // Mark subtask as in_progress
    await this.store.updateSubtaskResult(
      chainId,
      subtaskId,
      '',
      'in_progress',
      snippet.tokens_used
    );

    return {
      chain_id: chainId,
      subtask_id: subtaskId,
      tokens_used: snippet.tokens_used,
      relevance_score: snippet.relevance_score,
      snippet: snippet.snippet,
    };
  }

  // ==========================================================================
  // Subtask Management
  // ==========================================================================

  /**
   * Updates a subtask with its result
   *
   * @param chainId - Execution chain ID
   * @param subtaskId - Subtask ID
   * @param result - Result of the subtask
   * @param status - New status (defaults to completed)
   * @returns Update result with progress
   * @throws Error if subtask not found
   */
  async updateSubtaskResult(
    chainId: string,
    subtaskId: string,
    result: string,
    status?: SubtaskStatus
  ): Promise<UpdateSubtaskResult> {
    const effectiveStatus = status ?? 'completed';
    const subtask = await this.store.updateSubtaskResult(
      chainId,
      subtaskId,
      result,
      effectiveStatus
    );

    if (!subtask) {
      throw new Error(`Subtask ${subtaskId} not found`);
    }

    // Get overall progress
    const summary = await this.store.getExecutionChainSummary(chainId);
    const progress = summary?.progress ?? {
      total: 0,
      completed: 0,
      pending: 0,
      in_progress: 0,
      failed: 0,
    };

    const allComplete = progress.pending === 0 && progress.in_progress === 0;

    return {
      subtask_id: subtaskId,
      status: subtask.status,
      progress,
      all_complete: allComplete,
    };
  }

  // ==========================================================================
  // Results Management
  // ==========================================================================

  /**
   * Merges results from all completed subtasks
   *
   * @param chainId - Execution chain ID
   * @param includeFailed - Include failed subtask results
   * @returns Merged results
   * @throws Error if chain not found or no completed subtasks
   */
  async mergeResults(
    chainId: string,
    includeFailed: boolean = false
  ): Promise<MergeResultsServiceResult> {
    const summary = await this.store.getExecutionChainSummary(chainId);
    if (!summary) {
      throw new Error(`Execution chain ${chainId} not found`);
    }

    // Filter subtasks based on include_failed flag
    const relevantSubtasks = includeFailed
      ? summary.subtasks
      : summary.subtasks.filter(s => s.status === 'completed');

    if (relevantSubtasks.length === 0) {
      throw new Error(
        `No completed subtasks to merge. Progress: ${JSON.stringify(summary.progress)}`
      );
    }

    // Aggregate results
    const aggregatedResult = this.aggregateSubtaskResults(relevantSubtasks);

    // Calculate metrics
    const totalTokens = relevantSubtasks.reduce(
      (sum, s) => sum + (s.tokens_used ?? 0),
      0
    );
    const sourceCoverage = summary.context.estimated_tokens
      ? Math.min(1, totalTokens / summary.context.estimated_tokens)
      : 0;

    const confidence = summary.progress.failed === 0 ? 0.9 : 0.7;

    const mergedResults: MergedResults = {
      aggregated_result: aggregatedResult,
      confidence,
      source_coverage: sourceCoverage,
      subtasks_completed: summary.progress.completed,
      subtasks_total: summary.progress.total,
    };

    // Store merged results
    await this.store.storeMergedResults(chainId, mergedResults);

    // Mark chain as completed
    await this.store.updateExecutionContext(chainId, { status: 'completed' });

    return {
      chain_id: chainId,
      subtasks_merged: relevantSubtasks.length,
      confidence,
      source_coverage: sourceCoverage,
      aggregated_result: aggregatedResult,
    };
  }

  /**
   * Aggregates results from subtasks into a single string
   */
  private aggregateSubtaskResults(subtasks: Subtask[]): string {
    return subtasks
      .filter(s => s.result)
      .map(s => `[Subtask ${s.order + 1}: ${s.description}]\n${s.result}`)
      .join('\n\n---\n\n');
  }

  // ==========================================================================
  // Verification
  // ==========================================================================

  /**
   * Verifies an answer against the source context
   *
   * @param chainId - Execution chain ID
   * @param answer - The proposed answer to verify
   * @param verificationQueries - Queries to verify against
   * @returns Verification result
   * @throws Error if chain not found
   */
  async verifyAnswer(
    chainId: string,
    answer: string,
    verificationQueries: string[]
  ): Promise<VerificationResult> {
    const context = await this.store.getExecutionContext(chainId);
    if (!context) {
      throw new Error(`Execution chain ${chainId} not found`);
    }

    // Run verification queries
    const verificationResults: Array<{
      query: string;
      found: boolean;
      snippet?: string;
      relevance: number;
    }> = [];

    for (const query of verificationQueries) {
      const snippet = await this.store.getContextSnippet(chainId, query, 1000);
      if (snippet) {
        const found = snippet.relevance_score > 0.01;
        verificationResults.push({
          query,
          found,
          snippet: found ? snippet.snippet.substring(0, 200) + '...' : undefined,
          relevance: snippet.relevance_score,
        });
      }
    }

    // Calculate verification confidence
    const foundCount = verificationResults.filter(r => r.found).length;
    const confidence = verificationQueries.length > 0
      ? foundCount / verificationQueries.length
      : 0;
    const verified = confidence >= this.config.verificationThreshold;

    // Find discrepancies
    const discrepancies = verificationResults
      .filter(r => !r.found)
      .map(r => `Query "${r.query}" not found in context`);

    return {
      verified,
      confidence,
      corrections: undefined,
      discrepancies: discrepancies.length > 0 ? discrepancies : undefined,
    };
  }

  // ==========================================================================
  // Status & Monitoring
  // ==========================================================================

  /**
   * Gets the execution chain summary with progress
   *
   * @param chainId - Execution chain ID
   * @returns Execution chain summary
   * @throws Error if chain not found
   */
  async getExecutionStatus(chainId: string): Promise<ExecutionChainSummary> {
    const summary = await this.store.getExecutionChainSummary(chainId);
    if (!summary) {
      throw new Error(`Execution chain ${chainId} not found`);
    }
    return summary;
  }

  /**
   * Gets merged results for a completed chain
   *
   * @param chainId - Execution chain ID
   * @returns Merged results or null if not completed
   */
  async getMergedResults(chainId: string): Promise<MergedResults | null> {
    return this.store.getMergedResults(chainId);
  }
}
