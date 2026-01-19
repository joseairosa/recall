"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  BookOpen,
  Terminal,
  Zap,
  Database,
  GitBranch,
  Clock,
  Layers,
  FileCode,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

type TabValue = "getting-started" | "commands" | "workflows" | "best-practices";

const tabs = [
  { value: "getting-started" as const, label: "Getting Started" },
  { value: "commands" as const, label: "MCP Commands" },
  { value: "workflows" as const, label: "Slash Commands" },
  { value: "best-practices" as const, label: "Best Practices" },
];

export default function DocsPage() {
  const [activeTab, setActiveTab] = useState<TabValue>("getting-started");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Documentation</h1>
        <p className="text-muted-foreground mt-1">
          Learn how to use Recall MCP effectively with Claude.
        </p>
      </div>

      {/* Tab Navigation */}
      <div className="flex flex-wrap gap-2 border-b pb-4">
        {tabs.map((tab) => (
          <Button
            key={tab.value}
            variant={activeTab === tab.value ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveTab(tab.value)}
            className={cn(
              activeTab === tab.value && "bg-primary text-primary-foreground"
            )}
          >
            {tab.label}
          </Button>
        ))}
      </div>

      {/* Getting Started */}
      {activeTab === "getting-started" && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <Zap className="w-5 h-5 text-primary" />
                <CardTitle>Quick Start</CardTitle>
              </div>
              <CardDescription>
                The optimal workflow for starting any Claude session
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <h4 className="font-semibold">Step 1: Set Workspace</h4>
                <div className="bg-muted p-4 rounded-lg font-mono text-sm overflow-x-auto">
                  <code>set_workspace(&#123; path: &quot;/path/to/your/project&quot; &#125;)</code>
                </div>
                <p className="text-sm text-muted-foreground">
                  Isolates memories to the current project, so you don&apos;t get
                  irrelevant context from other projects.
                </p>
              </div>

              <div className="space-y-4">
                <h4 className="font-semibold">Step 2: Auto-load Context</h4>
                <div className="bg-muted p-4 rounded-lg font-mono text-sm overflow-x-auto">
                  <code>
                    auto_session_start(&#123; task_hint: &quot;what you&apos;re working on&quot; &#125;)
                  </code>
                </div>
                <p className="text-sm text-muted-foreground">
                  This retrieves in one call: active directives, recent
                  decisions (last 24h), code patterns, and critical items.
                </p>
              </div>

              <div className="mt-6 p-4 bg-primary/5 border border-primary/20 rounded-lg">
                <h4 className="font-semibold text-primary mb-2">
                  Why This Matters for Context Window
                </h4>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <p className="text-sm font-medium text-destructive">
                      Without Recall
                    </p>
                    <ul className="text-sm text-muted-foreground mt-1 space-y-1">
                      <li>- Repeat project context every session</li>
                      <li>- Re-explain decisions made last week</li>
                      <li>- Waste tokens on background info</li>
                    </ul>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-green-600">
                      With Recall
                    </p>
                    <ul className="text-sm text-muted-foreground mt-1 space-y-1">
                      <li>- Context loaded automatically</li>
                      <li>- Decisions recalled from memory</li>
                      <li>- ~500 tokens vs 2000+ explained</li>
                    </ul>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <Database className="w-5 h-5 text-primary" />
                <CardTitle>What to Store</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid gap-6 md:grid-cols-2">
                <div>
                  <h4 className="font-semibold text-green-600 mb-3">
                    High Signal (Store These)
                  </h4>
                  <ul className="space-y-2 text-sm">
                    <li className="flex items-start gap-2">
                      <ChevronRight className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                      <span>
                        <strong>Decisions:</strong> &quot;Chose Redis over Postgres
                        because...&quot;
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <ChevronRight className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                      <span>
                        <strong>Directives:</strong> &quot;Always use ULIDs, never
                        auto-increment&quot;
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <ChevronRight className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                      <span>
                        <strong>Patterns:</strong> &quot;API endpoints follow
                        /api/v1/&#123;resource&#125;&quot;
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <ChevronRight className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                      <span>
                        <strong>Preferences:</strong> &quot;User prefers informal
                        tone&quot;
                      </span>
                    </li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-semibold text-destructive mb-3">
                    Low Signal (Don&apos;t Store)
                  </h4>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    <li className="flex items-start gap-2">
                      <span className="text-destructive flex-shrink-0">✗</span>
                      <span>Code implementations (that&apos;s what files are for)</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-destructive flex-shrink-0">✗</span>
                      <span>Temporary debugging notes</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-destructive flex-shrink-0">✗</span>
                      <span>Generic knowledge Claude already knows</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-destructive flex-shrink-0">✗</span>
                      <span>Conversation chitchat</span>
                    </li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* MCP Commands */}
      {activeTab === "commands" && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <Terminal className="w-5 h-5 text-primary" />
                <CardTitle>Core Memory Operations</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 pr-4 font-semibold">
                        Command
                      </th>
                      <th className="text-left py-2 font-semibold">Purpose</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    <tr>
                      <td className="py-2 pr-4 font-mono text-xs">
                        store_memory
                      </td>
                      <td className="py-2 text-muted-foreground">
                        Save a new memory with content, type, importance, and tags
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2 pr-4 font-mono text-xs">
                        search_memories
                      </td>
                      <td className="py-2 text-muted-foreground">
                        Semantic search across memories using embeddings
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2 pr-4 font-mono text-xs">
                        update_memory
                      </td>
                      <td className="py-2 text-muted-foreground">
                        Modify an existing memory&apos;s content or metadata
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2 pr-4 font-mono text-xs">
                        delete_memory
                      </td>
                      <td className="py-2 text-muted-foreground">
                        Remove a memory permanently
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2 pr-4 font-mono text-xs">
                        store_batch_memories
                      </td>
                      <td className="py-2 text-muted-foreground">
                        Store multiple memories in one call
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <Zap className="w-5 h-5 text-primary" />
                <CardTitle>Automatic Context (Use Proactively)</CardTitle>
              </div>
              <CardDescription>
                These commands should be called automatically by Claude
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 pr-4 font-semibold">
                        Command
                      </th>
                      <th className="text-left py-2 font-semibold">Purpose</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    <tr>
                      <td className="py-2 pr-4 font-mono text-xs">
                        auto_session_start
                      </td>
                      <td className="py-2 text-muted-foreground">
                        <strong>Call at session start</strong> - loads recent
                        decisions, directives, patterns
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2 pr-4 font-mono text-xs">
                        quick_store_decision
                      </td>
                      <td className="py-2 text-muted-foreground">
                        <strong>Call after decisions</strong> - stores with
                        reasoning and alternatives
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2 pr-4 font-mono text-xs">
                        should_use_rlm
                      </td>
                      <td className="py-2 text-muted-foreground">
                        <strong>Call before large content</strong> - checks if
                        RLM workflow needed
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2 pr-4 font-mono text-xs">
                        recall_relevant_context
                      </td>
                      <td className="py-2 text-muted-foreground">
                        Search for context related to current task
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2 pr-4 font-mono text-xs">
                        analyze_and_remember
                      </td>
                      <td className="py-2 text-muted-foreground">
                        Extract and store important info from conversation text
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2 pr-4 font-mono text-xs">
                        summarize_session
                      </td>
                      <td className="py-2 text-muted-foreground">
                        Create a session snapshot at end of work
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <Layers className="w-5 h-5 text-primary" />
                <CardTitle>RLM (Large Content Processing)</CardTitle>
              </div>
              <CardDescription>
                For processing content larger than context windows (~100KB+)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 pr-4 font-semibold">
                        Command
                      </th>
                      <th className="text-left py-2 font-semibold">Purpose</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    <tr>
                      <td className="py-2 pr-4 font-mono text-xs">
                        create_execution_context
                      </td>
                      <td className="py-2 text-muted-foreground">
                        Store large content, get processing strategy
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2 pr-4 font-mono text-xs">
                        decompose_task
                      </td>
                      <td className="py-2 text-muted-foreground">
                        Break into subtasks (filter/chunk/recursive/aggregate)
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2 pr-4 font-mono text-xs">
                        inject_context_snippet
                      </td>
                      <td className="py-2 text-muted-foreground">
                        Extract relevant portion for a subtask
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2 pr-4 font-mono text-xs">
                        update_subtask_result
                      </td>
                      <td className="py-2 text-muted-foreground">
                        Store result after processing a subtask
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2 pr-4 font-mono text-xs">
                        merge_results
                      </td>
                      <td className="py-2 text-muted-foreground">
                        Combine all subtask results into final answer
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2 pr-4 font-mono text-xs">
                        verify_answer
                      </td>
                      <td className="py-2 text-muted-foreground">
                        Cross-check answer against source content
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2 pr-4 font-mono text-xs">
                        get_execution_status
                      </td>
                      <td className="py-2 text-muted-foreground">
                        Check progress of an RLM chain
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <GitBranch className="w-5 h-5 text-primary" />
                  <CardTitle>Memory Relationships</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <code className="font-mono text-xs">link_memories</code>
                    <span className="text-muted-foreground">Create relationship</span>
                  </div>
                  <div className="flex justify-between">
                    <code className="font-mono text-xs">get_related_memories</code>
                    <span className="text-muted-foreground">Get connected</span>
                  </div>
                  <div className="flex justify-between">
                    <code className="font-mono text-xs">unlink_memories</code>
                    <span className="text-muted-foreground">Remove relationship</span>
                  </div>
                  <div className="flex justify-between">
                    <code className="font-mono text-xs">get_memory_graph</code>
                    <span className="text-muted-foreground">Get graph</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <Clock className="w-5 h-5 text-primary" />
                  <CardTitle>Version Control</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <code className="font-mono text-xs">get_memory_history</code>
                    <span className="text-muted-foreground">Get versions</span>
                  </div>
                  <div className="flex justify-between">
                    <code className="font-mono text-xs">rollback_memory</code>
                    <span className="text-muted-foreground">Restore previous</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <FileCode className="w-5 h-5 text-primary" />
                  <CardTitle>Templates</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <code className="font-mono text-xs">create_template</code>
                    <span className="text-muted-foreground">Create reusable</span>
                  </div>
                  <div className="flex justify-between">
                    <code className="font-mono text-xs">create_from_template</code>
                    <span className="text-muted-foreground">Use template</span>
                  </div>
                  <div className="flex justify-between">
                    <code className="font-mono text-xs">list_templates</code>
                    <span className="text-muted-foreground">List all</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <Layers className="w-5 h-5 text-primary" />
                  <CardTitle>Categories</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <code className="font-mono text-xs">set_memory_category</code>
                    <span className="text-muted-foreground">Assign category</span>
                  </div>
                  <div className="flex justify-between">
                    <code className="font-mono text-xs">list_categories</code>
                    <span className="text-muted-foreground">List with counts</span>
                  </div>
                  <div className="flex justify-between">
                    <code className="font-mono text-xs">get_memories_by_category</code>
                    <span className="text-muted-foreground">Get by category</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <Database className="w-5 h-5 text-primary" />
                <CardTitle>Workspace &amp; Scope</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 pr-4 font-semibold">Command</th>
                      <th className="text-left py-2 font-semibold">Purpose</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    <tr>
                      <td className="py-2 pr-4 font-mono text-xs">set_workspace</td>
                      <td className="py-2 text-muted-foreground">
                        Set current project directory for memory isolation
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2 pr-4 font-mono text-xs">get_workspace</td>
                      <td className="py-2 text-muted-foreground">
                        Get current workspace path and ID
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2 pr-4 font-mono text-xs">convert_to_global</td>
                      <td className="py-2 text-muted-foreground">
                        Make a workspace memory accessible everywhere
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2 pr-4 font-mono text-xs">convert_to_workspace</td>
                      <td className="py-2 text-muted-foreground">
                        Make a global memory workspace-specific
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2 pr-4 font-mono text-xs">get_time_window_context</td>
                      <td className="py-2 text-muted-foreground">
                        Get memories from a time range (e.g., &quot;last 2 hours&quot;)
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <FileCode className="w-5 h-5 text-primary" />
                <CardTitle>Import/Export &amp; Maintenance</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 pr-4 font-semibold">Command</th>
                      <th className="text-left py-2 font-semibold">Purpose</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    <tr>
                      <td className="py-2 pr-4 font-mono text-xs">export_memories</td>
                      <td className="py-2 text-muted-foreground">Export memories to JSON</td>
                    </tr>
                    <tr>
                      <td className="py-2 pr-4 font-mono text-xs">import_memories</td>
                      <td className="py-2 text-muted-foreground">Import memories from JSON</td>
                    </tr>
                    <tr>
                      <td className="py-2 pr-4 font-mono text-xs">find_duplicates</td>
                      <td className="py-2 text-muted-foreground">
                        Find and optionally merge duplicate memories
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2 pr-4 font-mono text-xs">consolidate_memories</td>
                      <td className="py-2 text-muted-foreground">
                        Manually merge multiple memories into one
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Slash Commands */}
      {activeTab === "workflows" && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <BookOpen className="w-5 h-5 text-primary" />
                <CardTitle>Workflow Slash Commands</CardTitle>
              </div>
              <CardDescription>
                These commands inject instructions to guide Claude on how to use
                Recall in specific scenarios
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="p-4 border rounded-lg space-y-3">
                <div className="flex items-center gap-2">
                  <code className="font-mono text-sm bg-primary/10 text-primary px-2 py-1 rounded">
                    /recall-remote:automatic_workflow
                  </code>
                </div>
                <p className="text-sm text-muted-foreground">
                  <strong>Purpose:</strong> Teaches Claude to use Recall
                  proactively without being asked.
                </p>
                <ul className="text-sm text-muted-foreground space-y-1 ml-4">
                  <li>- Reminds Claude to call <code>auto_session_start</code> at the beginning</li>
                  <li>- Reminds Claude to call <code>quick_store_decision</code> after decisions</li>
                  <li>- Reminds Claude to check <code>should_use_rlm</code> before large content</li>
                </ul>
                <p className="text-sm">
                  <strong>When to use:</strong> At the start of a session if you
                  want Claude to be proactive about memory.
                </p>
              </div>

              <div className="p-4 border rounded-lg space-y-3">
                <div className="flex items-center gap-2">
                  <code className="font-mono text-sm bg-primary/10 text-primary px-2 py-1 rounded">
                    /recall-remote:rlm_workflow
                  </code>
                </div>
                <p className="text-sm text-muted-foreground">
                  <strong>Purpose:</strong> Full guide for processing large
                  content that exceeds context limits.
                </p>
                <p className="text-sm text-muted-foreground">
                  Explains the 6-step RLM workflow:
                </p>
                <ol className="text-sm text-muted-foreground space-y-1 ml-4 list-decimal list-inside">
                  <li><code>create_execution_context</code> - Store large content</li>
                  <li><code>decompose_task</code> - Break into subtasks</li>
                  <li><code>inject_context_snippet</code> - Get relevant chunks</li>
                  <li><code>update_subtask_result</code> - Store partial results</li>
                  <li><code>merge_results</code> - Combine everything</li>
                  <li><code>verify_answer</code> - Cross-check accuracy</li>
                </ol>
                <p className="text-sm">
                  <strong>When to use:</strong> When you&apos;re about to analyze a
                  huge file, log dump, or document (100KB+).
                </p>
              </div>

              <div className="p-4 border rounded-lg space-y-3">
                <div className="flex items-center gap-2">
                  <code className="font-mono text-sm bg-primary/10 text-primary px-2 py-1 rounded">
                    /recall-remote:session_management
                  </code>
                </div>
                <p className="text-sm text-muted-foreground">
                  <strong>Purpose:</strong> Guide for session lifecycle management.
                </p>
                <ul className="text-sm text-muted-foreground space-y-1 ml-4">
                  <li>- <code>organize_session</code> - Group related memories into a named session</li>
                  <li>- <code>summarize_session</code> - Create a snapshot at end of work</li>
                  <li>- <code>get_time_window_context</code> - Retrieve memories from specific time ranges</li>
                </ul>
                <p className="text-sm">
                  <strong>When to use:</strong> At the end of a work session to
                  preserve context, or when resuming work from a previous session.
                </p>
              </div>

              <div className="p-4 border rounded-lg space-y-3">
                <div className="flex items-center gap-2">
                  <code className="font-mono text-sm bg-primary/10 text-primary px-2 py-1 rounded">
                    /recall-remote:workspace_context
                  </code>
                </div>
                <p className="text-sm text-muted-foreground">
                  <strong>Purpose:</strong> Guide for workspace isolation.
                </p>
                <ul className="text-sm text-muted-foreground space-y-1 ml-4">
                  <li>- <code>set_workspace</code> - Isolate memories to a project</li>
                  <li>- <code>get_workspace</code> - Check current workspace</li>
                  <li>- <code>convert_to_global</code> / <code>convert_to_workspace</code> - Move memories between scopes</li>
                </ul>
                <p className="text-sm">
                  <strong>When to use:</strong> When switching between projects,
                  or when you want a preference to apply globally.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>When to Use Each Command</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 pr-4 font-semibold">Scenario</th>
                      <th className="text-left py-2 font-semibold">Command</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    <tr>
                      <td className="py-3 pr-4">Starting fresh session</td>
                      <td className="py-3">
                        <code className="font-mono text-xs bg-muted px-2 py-1 rounded">
                          /recall-remote:automatic_workflow
                        </code>
                      </td>
                    </tr>
                    <tr>
                      <td className="py-3 pr-4">Processing 500KB log file</td>
                      <td className="py-3">
                        <code className="font-mono text-xs bg-muted px-2 py-1 rounded">
                          /recall-remote:rlm_workflow
                        </code>
                      </td>
                    </tr>
                    <tr>
                      <td className="py-3 pr-4">Ending work for the day</td>
                      <td className="py-3">
                        <code className="font-mono text-xs bg-muted px-2 py-1 rounded">
                          /recall-remote:session_management
                        </code>
                      </td>
                    </tr>
                    <tr>
                      <td className="py-3 pr-4">Switching projects</td>
                      <td className="py-3">
                        <code className="font-mono text-xs bg-muted px-2 py-1 rounded">
                          /recall-remote:workspace_context
                        </code>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="text-sm text-muted-foreground mt-4">
                You typically only need <code>/recall-remote:automatic_workflow</code> at
                session start - it covers most cases.
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Best Practices */}
      {activeTab === "best-practices" && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <Zap className="w-5 h-5 text-primary" />
                <CardTitle>The Automatic Flow</CardTitle>
              </div>
              <CardDescription>
                How Claude should use Recall throughout a session
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-start gap-4 p-4 bg-muted rounded-lg">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold flex-shrink-0">
                    1
                  </div>
                  <div>
                    <p className="font-medium">User Sends First Message</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      → <code>auto_session_start(&#123; task_hint: &quot;...&quot; &#125;)</code>
                      <br />→ Get context, then proceed with task
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-4 p-4 bg-muted rounded-lg">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold flex-shrink-0">
                    2
                  </div>
                  <div>
                    <p className="font-medium">Make a Decision During Work</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      → Do the work
                      <br />→ <code>quick_store_decision(&#123; decision: &quot;...&quot;, reasoning: &quot;...&quot; &#125;)</code>
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-4 p-4 bg-muted rounded-lg">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold flex-shrink-0">
                    3
                  </div>
                  <div>
                    <p className="font-medium">Encounter Large Content</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      → <code>should_use_rlm(&#123; content: &quot;...&quot;, task: &quot;...&quot; &#125;)</code>
                      <br />→ If recommendation is &quot;use_rlm&quot;, use RLM workflow
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-4 p-4 bg-muted rounded-lg">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold flex-shrink-0">
                    4
                  </div>
                  <div>
                    <p className="font-medium">End of Significant Discussion</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      → <code>analyze_and_remember(&#123; conversation_text: &quot;...&quot; &#125;)</code>
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-4 p-4 bg-muted rounded-lg">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold flex-shrink-0">
                    5
                  </div>
                  <div>
                    <p className="font-medium">End of Session</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      → <code>summarize_session(&#123; session_name: &quot;...&quot; &#125;)</code>
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Proactive vs Reactive</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 pr-4 font-semibold text-destructive">
                        Old Way (Manual)
                      </th>
                      <th className="text-left py-2 font-semibold text-green-600">
                        New Way (Automatic)
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    <tr>
                      <td className="py-3 pr-4 text-muted-foreground">
                        User says &quot;recall context&quot;
                      </td>
                      <td className="py-3">
                        Claude calls auto_session_start automatically
                      </td>
                    </tr>
                    <tr>
                      <td className="py-3 pr-4 text-muted-foreground">
                        User says &quot;remember this decision&quot;
                      </td>
                      <td className="py-3">
                        Claude calls quick_store_decision after deciding
                      </td>
                    </tr>
                    <tr>
                      <td className="py-3 pr-4 text-muted-foreground">
                        User manually invokes RLM
                      </td>
                      <td className="py-3">
                        Claude checks should_use_rlm before processing
                      </td>
                    </tr>
                    <tr>
                      <td className="py-3 pr-4 text-muted-foreground">
                        Context forgotten between sessions
                      </td>
                      <td className="py-3">
                        Context automatically loaded at start
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Context Types</CardTitle>
              <CardDescription>
                Use the appropriate type when storing memories
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <code className="font-mono text-xs bg-blue-500/10 text-blue-600 px-2 py-1 rounded">
                      directive
                    </code>
                    <span className="text-sm text-muted-foreground">
                      Rules Claude must follow
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <code className="font-mono text-xs bg-green-500/10 text-green-600 px-2 py-1 rounded">
                      decision
                    </code>
                    <span className="text-sm text-muted-foreground">
                      Choices made with reasoning
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <code className="font-mono text-xs bg-purple-500/10 text-purple-600 px-2 py-1 rounded">
                      code_pattern
                    </code>
                    <span className="text-sm text-muted-foreground">
                      Established code conventions
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <code className="font-mono text-xs bg-orange-500/10 text-orange-600 px-2 py-1 rounded">
                      preference
                    </code>
                    <span className="text-sm text-muted-foreground">
                      User preferences and style
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <code className="font-mono text-xs bg-yellow-500/10 text-yellow-600 px-2 py-1 rounded">
                      requirement
                    </code>
                    <span className="text-sm text-muted-foreground">
                      Project requirements
                    </span>
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <code className="font-mono text-xs bg-gray-500/10 text-gray-600 px-2 py-1 rounded">
                      information
                    </code>
                    <span className="text-sm text-muted-foreground">
                      General context
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <code className="font-mono text-xs bg-cyan-500/10 text-cyan-600 px-2 py-1 rounded">
                      insight
                    </code>
                    <span className="text-sm text-muted-foreground">
                      Learned observations
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <code className="font-mono text-xs bg-red-500/10 text-red-600 px-2 py-1 rounded">
                      error
                    </code>
                    <span className="text-sm text-muted-foreground">
                      Bug patterns to avoid
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <code className="font-mono text-xs bg-pink-500/10 text-pink-600 px-2 py-1 rounded">
                      todo
                    </code>
                    <span className="text-sm text-muted-foreground">
                      Tasks to remember
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <code className="font-mono text-xs bg-indigo-500/10 text-indigo-600 px-2 py-1 rounded">
                      heading
                    </code>
                    <span className="text-sm text-muted-foreground">
                      Section markers
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Importance Scale</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <div className="w-20 text-center">
                    <span className="text-2xl font-bold text-muted-foreground">1-3</span>
                  </div>
                  <div>
                    <p className="font-medium">Low (Transient)</p>
                    <p className="text-sm text-muted-foreground">
                      Temporary context, can be forgotten
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="w-20 text-center">
                    <span className="text-2xl font-bold text-yellow-600">4-7</span>
                  </div>
                  <div>
                    <p className="font-medium">Medium (General)</p>
                    <p className="text-sm text-muted-foreground">
                      Useful context, worth keeping
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="w-20 text-center">
                    <span className="text-2xl font-bold text-primary">8-10</span>
                  </div>
                  <div>
                    <p className="font-medium">High (Critical)</p>
                    <p className="text-sm text-muted-foreground">
                      Auto-indexed, always loaded at session start
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
