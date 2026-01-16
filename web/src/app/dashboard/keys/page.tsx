"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Key, RefreshCw, Trash2, Copy, Check, AlertCircle } from "lucide-react";
import { api, ApiKey } from "@/lib/api";
import { formatDate, formatRelativeTime } from "@/lib/utils";

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadKeys = async () => {
    const apiKey = localStorage.getItem("recall_api_key");
    if (!apiKey) return;

    api.setApiKey(apiKey);
    const response = await api.getApiKeys();

    if (response.success && response.data) {
      setKeys(response.data);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadKeys();
  }, []);

  const handleRevoke = async (keyId: string) => {
    if (!confirm("Are you sure you want to revoke this API key? This cannot be undone.")) {
      return;
    }

    setActionLoading(keyId);
    setError(null);

    const response = await api.revokeApiKey(keyId);

    if (response.success) {
      await loadKeys();
    } else {
      setError(response.error?.message || "Failed to revoke key");
    }

    setActionLoading(null);
  };

  const handleRegenerate = async (keyId: string) => {
    if (!confirm("This will generate a new key and revoke the old one. Continue?")) {
      return;
    }

    setActionLoading(keyId);
    setError(null);

    const response = await api.regenerateApiKey(keyId);

    if (response.success && response.data) {
      setNewKey(response.data.apiKey);
      // Update local storage if regenerating current key
      localStorage.setItem("recall_api_key", response.data.apiKey);
      api.setApiKey(response.data.apiKey);
      await loadKeys();
    } else {
      setError(response.error?.message || "Failed to regenerate key");
    }

    setActionLoading(null);
  };

  const copyToClipboard = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="animate-pulse space-y-6">
        <div className="h-8 bg-muted rounded w-48" />
        <div className="h-64 bg-muted rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">API Keys</h1>
          <p className="text-muted-foreground mt-1">
            Manage your API keys for accessing Recall services.
          </p>
        </div>
      </div>

      {/* New Key Display */}
      {newKey && (
        <Card className="border-green-500/50 bg-green-500/5">
          <CardContent className="pt-6">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center flex-shrink-0">
                <Check className="w-5 h-5 text-green-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium">New API Key Generated</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Copy this key now. You won&apos;t be able to see it again.
                </p>
                <div className="flex items-center gap-2 mt-3">
                  <code className="flex-1 bg-background border rounded px-3 py-2 text-sm font-mono break-all">
                    {newKey}
                  </code>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => copyToClipboard(newKey)}
                  >
                    {copied ? (
                      <Check className="w-4 h-4" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setNewKey(null)}
              >
                Dismiss
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Error Display */}
      {error && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-destructive" />
              <p className="text-sm text-destructive">{error}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Keys List */}
      <Card>
        <CardHeader>
          <CardTitle>Your API Keys</CardTitle>
          <CardDescription>
            API keys are used to authenticate requests to the Recall API and MCP endpoint.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {keys.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No API keys found. Create one to get started.
            </p>
          ) : (
            <div className="space-y-4">
              {keys.map((key) => (
                <div
                  key={key.id}
                  className={`flex items-center gap-4 p-4 rounded-lg border ${
                    key.status === "revoked"
                      ? "bg-muted/50 opacity-60"
                      : "bg-card"
                  }`}
                >
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Key className="w-5 h-5 text-primary" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{key.name || "Unnamed Key"}</p>
                      {key.status === "revoked" && (
                        <span className="text-xs bg-destructive/10 text-destructive px-2 py-0.5 rounded">
                          Revoked
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-mono text-muted-foreground mt-1">
                      {key.apiKeyPreview}
                    </p>
                    <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                      <span>Created {formatDate(key.createdAt)}</span>
                      {key.lastUsedAt && (
                        <span>Last used {formatRelativeTime(key.lastUsedAt)}</span>
                      )}
                      <span>{key.usageCount} requests</span>
                    </div>
                  </div>

                  {key.status === "active" && (
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleRegenerate(key.id)}
                        disabled={actionLoading === key.id}
                      >
                        {actionLoading === key.id ? (
                          <RefreshCw className="w-4 h-4 animate-spin" />
                        ) : (
                          <RefreshCw className="w-4 h-4" />
                        )}
                        <span className="ml-2 hidden sm:inline">Regenerate</span>
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-destructive hover:text-destructive"
                        onClick={() => handleRevoke(key.id)}
                        disabled={actionLoading === key.id}
                      >
                        <Trash2 className="w-4 h-4" />
                        <span className="ml-2 hidden sm:inline">Revoke</span>
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Usage Instructions */}
      <Card>
        <CardHeader>
          <CardTitle>Using Your API Key</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h4 className="font-medium mb-2">REST API</h4>
            <div className="bg-muted rounded-lg p-4 font-mono text-sm">
              <pre>
                {`curl -X POST ${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080"}/api/memories \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"content": "Remember this important fact"}'`}
              </pre>
            </div>
          </div>

          <div>
            <h4 className="font-medium mb-2">MCP Configuration</h4>
            <div className="bg-muted rounded-lg p-4 font-mono text-sm">
              <pre>
                {`{
  "mcpServers": {
    "recall": {
      "url": "${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080"}/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_API_KEY"
      }
    }
  }
}`}
              </pre>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
