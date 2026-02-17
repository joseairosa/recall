# Cross-Session Workflow Threads & Auto-Consolidation Pipeline

Created: 2026-02-17
Status: VERIFIED
Approved: Yes
Iterations: 0
Worktree: No

> **Status Lifecycle:** PENDING → COMPLETE → VERIFIED
> **Iterations:** Tracks implement→verify cycles (incremented by verify phase)
>
> - PENDING: Initial state, awaiting implementation
> - COMPLETE: All tasks implemented
> - VERIFIED: All checks passed
>
> **Approval Gate:** Implementation CANNOT proceed until `Approved: Yes`
> **Worktree:** Set at plan creation (from dispatcher). `Yes` uses git worktree isolation; `No` works directly on current branch (default)

## Summary

**Goal:** Add two features to make Recall a proper context companion: (1) workflow threads that preserve context across multiple sessions working on the same task, and (2) an auto-consolidation pipeline that clusters similar memories and creates consolidated summaries to keep the store efficient.

**Architecture:** Both features follow the existing pattern: Zod schemas in `types.ts`, business logic in `services/`, thin MCP tool handlers in `tools/`, MemoryStore methods for persistence, and dependency injection for multi-tenant HTTP mode. Workflows use a new Redis data structure (hash + sorted sets). Consolidation creates new "consolidated" memories and links originals via `supersedes` relationships.

**Tech Stack:** TypeScript, Redis (ioredis), Zod schemas, Vitest, existing embedding/cosine-similarity infrastructure.

## Scope

### In Scope

- Workflow CRUD: start, get active, link memory, complete/pause/resume, list
- Auto-tagging: memories stored during active workflow automatically tagged with `workflow:{id}`
- `auto_session_start` integration: active workflow context loaded at session start
- Consolidation service: find clusters, create consolidated memories, link originals as superseded
- Event-triggered consolidation: runs when memory count exceeds threshold or manual trigger
- Consolidation report: shows what was merged and why
- MCP tool interfaces for both features
- Comprehensive tests for services and tools

### Out of Scope

- Timer-based background consolidation (event-triggered only)
- Multiple simultaneous active workflows (one-at-a-time model)
- Cross-workspace workflow sharing
- UI/dashboard for workflows
- Automatic consolidation scheduling via cron

## Runtime Environment

- **Start Redis:** `redis-server`
- **Build:** `npm run build`
- **Run MCP server:** `REDIS_URL=redis://localhost:6379 ANTHROPIC_API_KEY=sk-... node dist/index.js`
- **Manual verification:** Call `start_workflow`, store memories via `store_memory`, call `get_active_workflow` to confirm auto-tagging, call `complete_workflow`, call `auto_consolidate` with low threshold to verify clustering.

## Prerequisites

- Redis running locally for tests
- Existing embedding provider configured (for consolidation similarity checks)
- No migrations needed — all new Redis keys

## Context for Implementer

> This section is critical for cross-session continuity.

- **Patterns to follow:**
  - Tool module pattern: see `src/tools/rlm-tools.ts:1-20` — module-level `setXMemoryStore()`, thin handlers
  - Service pattern: see `src/services/rlm.service.ts` — constructor takes `MemoryStore`, business logic methods
  - Schema pattern: see `src/types.ts:320-333` — Zod schemas with `.describe()` on every field
  - StorageKeys pattern: see `src/types.ts:257-313` — workspace-scoped and global key functions
  - Test pattern: see `src/services/rlm.service.test.ts:1-30` — `MockMemoryStore`, `beforeEach` reset
  - Mock pattern: see `src/__mocks__/memory-store.mock.ts` — factory functions for test data

- **Conventions:**
  - IDs: Always ULID via `ulid()` from `ulid` package
  - Imports: Use `.js` extension even for `.ts` files (ESM)
  - Errors: `McpError(ErrorCode.InvalidRequest|InternalError, message)`
  - Tool registration: Spread into `tools` object in `src/tools/index.ts`
  - Store injection: Add `setXMemoryStore()` call to `setMemoryStore()` in `src/tools/index.ts`

- **Key files the implementer must read:**
  - `src/types.ts` — All schemas and StorageKeys (where new schemas/keys go)
  - `src/tools/index.ts` — Tool registration and store injection (where new tools get wired)
  - `src/tools/context-tools.ts:618-778` — `auto_session_start` (needs modification)
  - `src/persistence/memory-store.ts:37-134` — `createMemory()` (needs auto-tagging hook)
  - `src/tools/export-import-tools.ts:217-349` — `findDuplicates()` (existing similarity logic to reuse)

- **Gotchas:**
  - `findDuplicates` in export-import-tools.ts:221 creates a NEW store instead of using injected — existing bug, don't replicate
  - `auto_session_start` uses token budgeting (4 chars ≈ 1 token) — workflow section must respect this budget with hard truncation
  - Pipeline operations are not truly atomic in Redis (partial failures possible) — use same pattern as existing code
  - The `ConversationAnalyzer` requires `ANTHROPIC_API_KEY` — consolidation summary generation should have a non-AI fallback
  - **memory-store.ts is 2268 lines** — do NOT add workflow methods directly to it. Use `workflow-store.ts` (Task 2) with composition pattern.
  - **Global memories (`is_global: true`) skip workflow auto-tagging** — workflows are workspace-scoped
  - **Concurrent safety:** `setActiveWorkflow()` uses SET NX — always check return value before proceeding

## Progress Tracking

**MANDATORY: Update this checklist as tasks complete. Change `[ ]` to `[x]`.**

- [x] Task 1: Workflow types, schemas, and storage keys
- [x] Task 2: Workflow persistence in WorkflowStore (composition)
- [x] Task 3: Workflow service (business logic)
- [x] Task 4: Workflow MCP tools
- [x] Task 5: Auto-tagging and auto_session_start integration
- [x] Task 6: Consolidation types and storage keys
- [x] Task 7: Consolidation service
- [x] Task 8: Consolidation MCP tools
- [x] Task 9: Tool registration and wiring

**Total Tasks:** 9 | **Completed:** 9 | **Remaining:** 0

## Implementation Tasks

### Task 1: Workflow Types, Schemas, and Storage Keys

**Objective:** Define all TypeScript types, Zod schemas, and Redis key patterns for the workflow feature.

**Dependencies:** None

**Files:**

- Modify: `src/types.ts`

**Key Decisions / Notes:**

- Workflow states: `active`, `paused`, `completed`
- One active workflow per workspace (enforced at service level, not schema level)
- Workflow hash stores: id, name, description, status, created_at, updated_at, completed_at, memory_count, summary
- **Single source of truth for memory IDs:** Use the Redis set `ws:{workspace}:workflow:{id}:memories` exclusively. Do NOT store `memory_ids` as a JSON array in the hash — it creates a sync risk. Use `SMEMBERS` to read and `SCARD` for count.
- Follow existing `StorageKeys` pattern for workspace scoping
- New StorageKeys:
  - `ws:{workspace}:workflow:{id}` — workflow hash
  - `ws:{workspace}:workflows:all` — sorted set (score = created_at)
  - `ws:{workspace}:workflow:active` — string (current active workflow ID)
  - `ws:{workspace}:workflow:{id}:memories` — set of linked memory IDs

**Definition of Done:**

- [ ] `WorkflowStatus` enum with `active`, `paused`, `completed`
- [ ] `WorkflowInfo` type and `WorkflowInfoSchema` Zod schema
- [ ] `CreateWorkflow` type and schema (name, description)
- [ ] `StartWorkflowSchema`, `CompleteWorkflowSchema`, `PauseWorkflowSchema`, `ResumeWorkflowSchema`, `GetWorkflowSchema`, `ListWorkflowsSchema` Zod schemas
- [ ] `WorkflowStorageKeys` added to types.ts following `StorageKeys` pattern
- [ ] All schemas have `.describe()` on every field
- [ ] `npm run build` succeeds with no type errors

**Verify:**

- `npx tsc --noEmit` — no type errors
- `npm run build` — builds cleanly

### Task 2: Workflow Persistence in MemoryStore

**Objective:** Add workflow CRUD methods to a new `WorkflowStore` module, imported by `MemoryStore` via composition.

**Dependencies:** Task 1

**Files:**

- Create: `src/persistence/workflow-store.ts` (new file — keeps `memory-store.ts` within size limits)
- Modify: `src/persistence/memory-store.ts` (import and expose WorkflowStore methods)
- Create: `src/persistence/workflow-store.test.ts` (test-first)

**Key Decisions / Notes:**

- **File size management:** `memory-store.ts` is already 2268 lines. Extract ALL workflow persistence methods into `src/persistence/workflow-store.ts`. MemoryStore imports WorkflowStore and delegates to it (composition). This keeps both files under the 500-line hard limit.
- Methods to add in WorkflowStore: `createWorkflow()`, `getWorkflow()`, `getActiveWorkflow()`, `getActiveWorkflowId()`, `setActiveWorkflow()`, `clearActiveWorkflow()`, `updateWorkflow()`, `linkMemoryToWorkflow()`, `getWorkflowMemories()`, `getAllWorkflows()`
- `getActiveWorkflowId()` — lightweight method returning just the ID string (no hash fetch). Used by `createMemory()` for fast active workflow check.
- Follow serialization/deserialization pattern from existing `createSession()`/`getSession()` (lines 628-706)
- `getActiveWorkflow()` reads from `ws:{workspace}:workflow:active` string key, then fetches the hash
- `linkMemoryToWorkflow()` uses `SADD` on the Redis set only. Memory count derived from `SCARD`, not a separate counter.
- `setActiveWorkflow()` uses `SET NX` (set if not exists) for atomic check-and-set. Returns false if another workflow is already active (prevents race condition between concurrent sessions).
- MemoryStore exposes WorkflowStore methods by delegation (e.g., `this.workflowStore.createWorkflow(...)`)

**Definition of Done:**

- [ ] `WorkflowStore` class in `src/persistence/workflow-store.ts`
- [ ] All workflow CRUD methods implemented
- [ ] MemoryStore delegates to WorkflowStore via composition
- [ ] `getActiveWorkflowId()` returns just the ID string or null (no hash fetch)
- [ ] `setActiveWorkflow()` uses SET NX for atomic concurrent-safe writes
- [ ] `getActiveWorkflow()` returns null when no active workflow
- [ ] `linkMemoryToWorkflow()` uses Redis set only (no JSON array in hash), idempotent
- [ ] Unit tests in `workflow-store.test.ts` cover: happy path, no active workflow returns null, duplicate linkMemory is no-op, SET NX rejects second active workflow, getWorkflow returns null for nonexistent ID
- [ ] All tests pass

**Verify:**

- `npx vitest run src/persistence/workflow-store.test.ts -q` — all tests pass

### Task 3: Workflow Service (Business Logic)

**Objective:** Create a `WorkflowService` with business logic for workflow lifecycle management.

**Dependencies:** Task 2

**Files:**

- Create: `src/services/workflow.service.ts`
- Modify: `src/services/workflow.service.test.ts` (add service-level tests)

**Key Decisions / Notes:**

- Service takes `MemoryStore` in constructor (same pattern as `RLMService`)
- `startWorkflow(name, description?)` — calls `setActiveWorkflow()` with SET NX. If NX fails, throw error. Creates workflow hash, sets as active atomically
- `completeWorkflow(workflowId?)` — reads memory IDs via `SMEMBERS` (single source of truth), generates summary from linked memories, sets status to completed, clears active
- `pauseWorkflow(workflowId?)` — sets status to paused, clears active pointer (allows starting new workflow)
- `resumeWorkflow(workflowId)` — validates no other active, sets to active
- `getActiveWorkflowContext(maxTokens?)` — retrieves active workflow + recent memories, formatted for context injection
- Summary generation: concatenate memory summaries grouped by type, no Claude API dependency (keep it simple)
- For `completeWorkflow`, use existing `generateSummary()` pattern (truncate to 200 chars) — no AI summarization needed

**Definition of Done:**

- [ ] WorkflowService class with all lifecycle methods
- [ ] `startWorkflow` throws if another workflow is already active
- [ ] `completeWorkflow` creates summary from linked memories
- [ ] `pauseWorkflow` allows starting a new workflow
- [ ] `resumeWorkflow` throws if another workflow is active
- [ ] `getActiveWorkflowContext` returns formatted context string within token budget
- [ ] Unit tests cover all methods including error cases
- [ ] All tests pass

**Verify:**

- `npx vitest run src/services/workflow.service.test.ts -q` — all tests pass

### Task 4: Workflow MCP Tools

**Objective:** Create MCP tool handlers for workflow management, exposing the service via tools.

**Dependencies:** Task 3

**Files:**

- Create: `src/tools/workflow-tools.ts`
- Create: `src/tools/workflow-tools.test.ts`

**Key Decisions / Notes:**

- Follow thin handler pattern from `src/tools/rlm-tools.ts`
- Tools to expose:
  - `start_workflow` — starts a new named workflow
  - `complete_workflow` — completes active workflow with summary
  - `pause_workflow` — pauses active workflow
  - `resume_workflow` — resumes a paused workflow
  - `get_active_workflow` — returns current active workflow with memory count
  - `list_workflows` — lists all workflows (optionally filtered by status)
  - `get_workflow_context` — retrieves workflow memories formatted for context
- Module-level `setWorkflowMemoryStore(store)` for dependency injection
- Each handler catches errors and throws `McpError`

**Definition of Done:**

- [ ] All 7 workflow tools implemented with proper Zod schema validation
- [ ] `setWorkflowMemoryStore()` setter exported
- [ ] Tool descriptions are clear and include usage guidance
- [ ] Unit tests cover each tool handler (mock service)
- [ ] All tests pass

**Verify:**

- `npx vitest run src/tools/workflow-tools.test.ts -q` — all tests pass

### Task 5: Auto-Tagging and auto_session_start Integration

**Objective:** Automatically tag memories with workflow ID when stored during an active workflow, and include active workflow context in `auto_session_start`.

**Dependencies:** Task 3, Task 4

**Files:**

- Modify: `src/persistence/memory-store.ts` (`createMemory` method)
- Modify: `src/tools/context-tools.ts` (`auto_session_start` function)
- Create: `src/tools/workflow-integration.test.ts`

**Key Decisions / Notes:**

- **Auto-tagging INSIDE the `createMemory()` pipeline (atomicity required):** Before `pipeline.exec()`, call `getActiveWorkflowId()` (a single Redis GET, ~1ms). If non-null AND `data.is_global !== true` (skip global memories — workflows are workspace-scoped), append to the SAME pipeline: `SADD` to `byTag('workflow:{id}')` index and `SADD` to the workflow's memory set key. This keeps the memory creation + workflow linking atomic — no orphaned memories if the process crashes mid-operation.
- **Skip global memories:** Global memories (`is_global: true`) are NOT auto-tagged with workflow IDs. Workflows are workspace-scoped, and tagging global memories would create cross-scope inconsistencies. Add a guard: `if (data.is_global) skip workflow tagging`.
- `getActiveWorkflowId()` is a lightweight method on WorkflowStore that reads just the string key — no hash fetch needed.
- **`auto_session_start` modification:** Add a new section "Active Workflow" after loading directives (line ~680 in context-tools.ts). This section loads: workflow name (truncated to 50 chars), description (truncated to 200 chars), memory count, and last 5 memory summaries (each truncated to 80 chars). Hard truncation ensures the section stays within 500 tokens regardless of user input.
- Token budget: workflow section should use max 500 tokens (within the 2000 default total)

**Definition of Done:**

- [ ] `createMemory()` auto-tags with `workflow:{id}` INSIDE the pipeline when active workflow exists
- [ ] Workflow tagging is atomic with memory creation (same pipeline.exec())
- [ ] Global memories (`is_global: true`) are NOT auto-tagged
- [ ] `createMemory()` auto-links memory to active workflow via pipeline SADD
- [ ] `auto_session_start` includes active workflow context section
- [ ] Workflow section respects token budget (max 500 tokens) with hard truncation: name ≤ 50 chars, description ≤ 200 chars, each memory summary ≤ 80 chars
- [ ] Integration tests verify auto-tagging works end-to-end
- [ ] `createMemory()` with no active workflow makes exactly one additional Redis GET (verified by inspecting code path)
- [ ] All tests pass

**Verify:**

- `npx vitest run src/tools/workflow-integration.test.ts -q` — integration tests pass
- `npm test` — full suite passes (no regressions)

### Task 6: Consolidation Types and Storage Keys

**Objective:** Define types, schemas, and Redis keys for the auto-consolidation pipeline.

**Dependencies:** None (can run in parallel with Tasks 1-5)

**Files:**

- Modify: `src/types.ts`

**Key Decisions / Notes:**

- Consolidation creates a new memory with `context_type: 'information'` and tag `consolidated`
- Original memories get linked to consolidated via `supersedes` relationship (existing `RelationshipType.SUPERSEDES`)
- Original memories are NOT deleted — they remain but are deprioritized in search (by convention, not enforcement)
- Consolidation config: `similarity_threshold` (default 0.75), `min_cluster_size` (default 2), `max_age_days` (optional), `max_memories` (default 1000)
- Consolidation result tracks: clusters found, memories consolidated, new consolidated memory IDs
- New StorageKeys:
  - `ws:{workspace}:consolidation:{id}` — consolidation run metadata hash
  - `ws:{workspace}:consolidations:all` — sorted set of consolidation runs (score = timestamp)
  - `ws:{workspace}:consolidations:last_run` — string key storing Unix timestamp of last consolidation run (O(1) lookup for `shouldConsolidate()`)

**Definition of Done:**

- [ ] `ConsolidationConfig` type and schema (similarity_threshold, min_cluster_size, max_age_days, memory_count_threshold, max_memories)
- [ ] `max_memories` config parameter with default 1000 (caps how many memories are loaded for clustering)
- [ ] `ConsolidationResult` type (clusters_found, memories_consolidated, consolidated_memory_ids, report)
- [ ] `ConsolidationRunSchema` for storing run history
- [ ] `TriggerConsolidationSchema`, `GetConsolidationStatusSchema` Zod schemas
- [ ] `ConsolidationStorageKeys` added to types.ts including `last_run` key
- [ ] `npm run build` succeeds

**Verify:**

- `npx tsc --noEmit` — no type errors
- `npm run build` — builds cleanly

### Task 7: Consolidation Service

**Objective:** Create a `ConsolidationService` with business logic for finding clusters, creating consolidated memories, and linking originals.

**Dependencies:** Task 6

**Files:**

- Create: `src/services/consolidation.service.ts`
- Create: `src/services/consolidation.service.test.ts`

**Key Decisions / Notes:**

- Service takes `MemoryStore` in constructor
- Core method: `runConsolidation(config?)`:
  1. Fetch memories (capped by `max_memories` config, default 1000). If total memory count > `max_memories`, sample the most recent N memories (by timestamp). This prevents O(n^2) from loading unbounded embeddings into RAM.
  2. **Skip memories without embeddings:** Filter out memories where `embedding` is null, undefined, or empty array. Log a count of skipped memories in the consolidation report.
  3. Compute pairwise cosine similarity (reuse `cosineSimilarity` from `embeddings/generator.ts`)
  4. Cluster memories where similarity >= threshold (use greedy clustering)
  5. **Cross-scope guard:** Only cluster memories with matching scope. If a memory is global (`is_global: true`), only cluster it with other global memories. Workspace-scoped memories only cluster with same-workspace memories.
  6. For each cluster of size >= `min_cluster_size`:
     a. Create consolidated memory: combine summaries, take max importance, merge tags. Set `is_global` on consolidated memory to match the cluster's scope.
     b. Create `supersedes` relationships from consolidated → each original
     c. Add `consolidated` tag to originals (so they can be filtered in search)
  7. Store consolidation run metadata. Write `last_run` timestamp key via `SET`.
  8. Return `ConsolidationResult` with report
- `shouldConsolidate(threshold?)`: read `ws:{workspace}:consolidations:last_run` key (O(1)). Return false if under memory count threshold or if last run was within 24h.
- `getConsolidationHistory(limit?)`: list past consolidation runs from sorted set
- **Clustering algorithm:** Greedy — iterate memories, for each unvisited memory find all others with similarity >= threshold, form cluster. Capped at `max_memories` (default 1000) for O(n^2) safety.
- **Default similarity threshold: 0.75** (not 0.85). Anthropic keyword-based embeddings require lower thresholds. Tool description explicitly warns that consolidation quality depends on embedding provider.
- **Consolidated content format:** "## Consolidated from N memories\n\n{summary1}\n\n{summary2}\n..."
- **No Claude dependency** — consolidation uses summaries and concatenation, not AI generation

**Definition of Done:**

- [ ] `ConsolidationService` class with `runConsolidation()`, `shouldConsolidate()`, `getConsolidationHistory()`
- [ ] If memory count > `max_memories` (default 1000), sample most recent 1000 memories for clustering
- [ ] Memories without embeddings (null/empty array) are skipped from clustering with count logged
- [ ] Cross-scope guard: global memories only cluster with global, workspace with workspace
- [ ] Greedy clustering finds correct clusters at given threshold (default 0.75)
- [ ] Consolidated memory created with merged content, max importance, merged tags, matching `is_global` scope
- [ ] `supersedes` relationships created from consolidated to each original
- [ ] Original memories get `consolidated` tag added
- [ ] Consolidation run metadata stored for history, `last_run` timestamp key updated
- [ ] `shouldConsolidate()` reads `last_run` key (O(1)), returns false if under threshold or recent run
- [ ] Unit tests cover: clustering, merging, relationship creation, scope matching, skip empty embeddings, sampling cap, edge cases (empty store, no clusters, single memory)
- [ ] All tests pass

**Verify:**

- `npx vitest run src/services/consolidation.service.test.ts -q` — all tests pass

### Task 8: Consolidation MCP Tools

**Objective:** Create MCP tool handlers for consolidation, exposing the service via tools.

**Dependencies:** Task 7

**Files:**

- Create: `src/tools/consolidation-tools.ts`
- Create: `src/tools/consolidation-tools.test.ts`

**Key Decisions / Notes:**

- Tools to expose:
  - `auto_consolidate` — runs consolidation pipeline with configurable thresholds; checks `shouldConsolidate()` first, returns early if not needed
  - `force_consolidate` — runs consolidation regardless of thresholds (manual trigger)
  - `consolidation_status` — returns whether consolidation is needed and last run info
- Note: The existing `consolidate_memories` tool (in export-import-tools.ts) merges a manually-specified list of memory IDs. The new tools run automatic clustering to discover which memories to merge — they complement rather than replace the existing tool. No changes to `consolidate_memories` needed.
- `auto_consolidate` is designed to be called proactively (e.g., in hooks) — it's a no-op if consolidation isn't needed
- Module-level `setConsolidationMemoryStore(store)` for dependency injection

**Definition of Done:**

- [ ] All 3 consolidation tools implemented
- [ ] `auto_consolidate` returns early with "not needed" message when under threshold
- [ ] `force_consolidate` always runs and returns detailed report
- [ ] `consolidation_status` shows memory count, threshold, last run date, recommendation, and current embedding provider (warns if using Anthropic keyword-based provider)
- [ ] Unit tests cover each tool handler
- [ ] All tests pass

**Verify:**

- `npx vitest run src/tools/consolidation-tools.test.ts -q` — all tests pass

### Task 9: Tool Registration and Wiring

**Objective:** Wire all new tools into the MCP server's tool registry and dependency injection.

**Dependencies:** Task 4, Task 5, Task 8

**Files:**

- Modify: `src/tools/index.ts`
- Modify: `src/http/mcp-handler.ts` (if HTTP transport needs explicit registration)

**Key Decisions / Notes:**

- Import workflow and consolidation tools into `src/tools/index.ts`
- Add `setWorkflowMemoryStore(store)` and `setConsolidationMemoryStore(store)` to the `setMemoryStore()` function
- Spread `...workflowTools` and `...consolidationTools` into the `tools` object
- Verify HTTP transport picks up new tools (it should via `tools/index.ts` re-export, but verify `mcp-handler.ts` doesn't have a hardcoded list)

**Definition of Done:**

- [ ] All workflow tools appear in `tools/list` response
- [ ] All consolidation tools appear in `tools/list` response
- [ ] Store injection propagates to workflow and consolidation modules
- [ ] `npm run build` succeeds
- [ ] `npm test` — full suite passes with no regressions
- [ ] Manual verification: `node dist/index.js` starts without errors (if Redis available)

**Verify:**

- `npm run build` — builds cleanly
- `npm test` — all tests pass
- `npx tsc --noEmit` — no type errors

## Testing Strategy

- **Unit tests:** Each service (WorkflowService, ConsolidationService) tested with MockMemoryStore. Each tool handler tested with mocked service.
- **Integration tests:** Auto-tagging test verifies end-to-end flow of creating a workflow + storing a memory + verifying tag.
- **Manual verification:** Start MCP server, call `start_workflow`, store some memories, verify they're tagged, call `complete_workflow`, verify summary.

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Auto-tagging in `createMemory()` adds latency | Medium | Low | Single Redis GET for active workflow check (~1ms). Workflow tagging commands appended to existing pipeline — no extra round trip. |
| Orphaned memories if workflow tagging fails | Low | Medium | All workflow tagging is inside the same `pipeline.exec()` as memory creation — atomic. No orphaned memories possible. |
| Consolidation O(n^2) clustering is slow for large stores | Low | Medium | Hard cap at `max_memories` (default 1000). If total count exceeds cap, sample most recent 1000. Documented in tool description. |
| Stale `workflow:active` key after crash | Low | Medium | `startWorkflow` validates the pointed-to workflow still exists. If not, clears the stale pointer. |
| Consolidation creates duplicate supersedes relationships | Low | Low | `createRelationship()` is already idempotent (checks for existing before creating). |
| Concurrent workflow starts (stdio + HTTP sharing Redis) | Low | Medium | `setActiveWorkflow()` uses Redis `SET NX` for atomic check-and-set. Second concurrent starter gets rejection error. |
| Cross-scope relationship errors in consolidation | Low | Medium | Consolidation only clusters memories with matching scope (global-with-global, workspace-with-workspace). Consolidated memory inherits scope from cluster. |
| Keyword-based embeddings produce poor clusters | Medium | Medium | Default threshold lowered to 0.75. `consolidation_status` tool warns when Anthropic keyword-based provider is active and recommends a vector provider. |
| Memory without embeddings causes clustering error | Low | Low | Memories with null/empty embedding are skipped from clustering. Count logged in consolidation report. |

## Open Questions

- None — all questions resolved during planning.

### Deferred Ideas

- Timer-based background consolidation for HTTP/SaaS (would require a scheduler service)
- Multiple simultaneous active workflows with priority ranking
- Cross-workspace workflow sharing for team collaboration
- AI-powered consolidation summaries (using Claude to generate better merged content)
- Workflow templates (pre-configured workflows for common patterns like "sprint", "bug-fix", "feature")
