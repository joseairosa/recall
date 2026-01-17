"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Database, Key, Activity, Clock } from "lucide-react";
import { api, TenantInfo, Memory, AuditEntry } from "@/lib/api";
import { formatRelativeTime } from "@/lib/utils";

// Compute API URL at runtime (not build time)
function getApiUrl(): string {
  if (typeof window === "undefined") return "";
  if (window.location.hostname === "localhost") {
    return "http://localhost:8080";
  }
  // Production: use the same domain
  return `${window.location.protocol}//${window.location.host}`;
}

export default function DashboardPage() {
  const [tenantInfo, setTenantInfo] = useState<TenantInfo | null>(null);
  const [recentMemories, setRecentMemories] = useState<Memory[]>([]);
  const [recentActivity, setRecentActivity] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [apiUrl, setApiUrl] = useState("");

  useEffect(() => {
    // Set API URL at runtime
    setApiUrl(getApiUrl());

    const loadData = async () => {
      const apiKey = localStorage.getItem("recall_api_key");
      if (!apiKey) return;

      api.setApiKey(apiKey);

      const [meResponse, memoriesResponse, auditResponse] = await Promise.all([
        api.getMe(),
        api.getMemories(5),
        api.getAuditEntries({ limit: 5 }),
      ]);

      if (meResponse.success && meResponse.data) {
        setTenantInfo(meResponse.data);
      }

      if (memoriesResponse.success && memoriesResponse.data) {
        setRecentMemories(memoriesResponse.data);
      }

      if (auditResponse.success && auditResponse.data) {
        setRecentActivity(auditResponse.data.entries);
      }

      setLoading(false);
    };

    loadData();
  }, []);

  if (loading) {
    return (
      <div className="animate-pulse space-y-6">
        <div className="h-8 bg-muted rounded w-48" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-32 bg-muted rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  const usagePercentage = tenantInfo
    ? Math.round(
        (tenantInfo.usage.memories / tenantInfo.limits.maxMemories) * 100
      )
    : 0;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          Welcome back! Here&apos;s an overview of your Recall account.
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="Total Memories"
          value={tenantInfo?.usage.memories.toString() || "0"}
          icon={<Database className="w-5 h-5" />}
          description={`${tenantInfo?.limits.maxMemories || 0} max`}
        />
        <StatsCard
          title="Usage"
          value={`${usagePercentage}%`}
          icon={<Activity className="w-5 h-5" />}
          description={`${tenantInfo?.usage.memories || 0} / ${
            tenantInfo?.limits.maxMemories || 0
          }`}
        />
        <StatsCard
          title="Plan"
          value={tenantInfo?.plan || "free"}
          icon={<Key className="w-5 h-5" />}
          description="Current subscription"
          className="capitalize"
        />
        <StatsCard
          title="Workspaces"
          value="1"
          icon={<Clock className="w-5 h-5" />}
          description={`${tenantInfo?.limits.maxWorkspaces || 1} max`}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent Memories */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Recent Memories</CardTitle>
          </CardHeader>
          <CardContent>
            {recentMemories.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No memories stored yet. Use the API or MCP to create your first
                memory.
              </p>
            ) : (
              <div className="space-y-4">
                {recentMemories.map((memory) => (
                  <div
                    key={memory.id}
                    className="flex items-start gap-3 pb-4 border-b last:border-0 last:pb-0"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate">{memory.content}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-muted-foreground">
                          {memory.context_type}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {formatRelativeTime(memory.created_at)}
                        </span>
                      </div>
                    </div>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        memory.importance >= 8
                          ? "bg-yellow-500/10 text-yellow-500"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {memory.importance}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            {recentActivity.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No activity recorded yet. Your API usage will appear here.
              </p>
            ) : (
              <div className="space-y-4">
                {recentActivity.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-center gap-3 pb-4 border-b last:border-0 last:pb-0"
                  >
                    <div
                      className={`w-2 h-2 rounded-full ${
                        entry.statusCode < 400
                          ? "bg-green-500"
                          : "bg-destructive"
                      }`}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm">
                        <span className="font-mono text-xs bg-muted px-1 rounded">
                          {entry.method}
                        </span>{" "}
                        <span className="text-muted-foreground">
                          {entry.path}
                        </span>
                      </p>
                      <span className="text-xs text-muted-foreground">
                        {formatRelativeTime(entry.timestamp)}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {entry.duration}ms
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick Setup Guide */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Quick Setup</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Add this to your Claude Desktop configuration to enable AI memory:
          </p>
          <div className="bg-muted rounded-lg p-4 font-mono text-sm overflow-x-auto">
            <pre>
              {`{
  "mcpServers": {
    "recall": {
      "url": "${apiUrl}/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_API_KEY"
      }
    }
  }
}`}
            </pre>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StatsCard({
  title,
  value,
  icon,
  description,
  className,
}: {
  title: string;
  value: string;
  icon: React.ReactNode;
  description: string;
  className?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center gap-2 text-muted-foreground mb-2">
          {icon}
          <span className="text-sm">{title}</span>
        </div>
        <p className={`text-2xl font-bold ${className}`}>{value}</p>
        <p className="text-xs text-muted-foreground mt-1">{description}</p>
      </CardContent>
    </Card>
  );
}
