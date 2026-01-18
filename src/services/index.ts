/**
 * Services Index
 *
 * Central export for all service classes.
 * Services encapsulate business logic and are stateless.
 */

export { RLMService, DEFAULT_RLM_CONFIG } from './rlm.service.js';
export type {
  RLMConfig,
  SubtaskDefinition,
  CreateExecutionContextResult,
  DecomposeTaskResult,
  InjectContextResult,
  UpdateSubtaskResult,
  MergeResultsServiceResult,
} from './rlm.service.js';
