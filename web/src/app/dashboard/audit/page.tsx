"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  FileText,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
} from "lucide-react";
import { api, AuditEntry } from "@/lib/api";
import { formatDate, cn } from "@/lib/utils";

const ITEMS_PER_PAGE = 25;

const ACTION_COLORS: Record<string, string> = {
  create: "bg-green-500/10 text-green-500",
  read: "bg-blue-500/10 text-blue-500",
  update: "bg-yellow-500/10 text-yellow-500",
  delete: "bg-red-500/10 text-red-500",
  search: "bg-purple-500/10 text-purple-500",
  list: "bg-gray-500/10 text-gray-500",
};

const RESOURCE_COLORS: Record<string, string> = {
  memory: "bg-primary/10 text-primary",
  session: "bg-orange-500/10 text-orange-500",
  apikey: "bg-cyan-500/10 text-cyan-500",
  stats: "bg-pink-500/10 text-pink-500",
};

export default function AuditLogPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [actionFilter, setActionFilter] = useState<string>("");
  const [resourceFilter, setResourceFilter] = useState<string>("");
  const [refreshing, setRefreshing] = useState(false);

  const loadEntries = async () => {
    const apiKey = localStorage.getItem("recall_api_key");
    if (!apiKey) return;

    api.setApiKey(apiKey);

    const response = await api.getAuditEntries({
      limit: ITEMS_PER_PAGE,
      offset: (page - 1) * ITEMS_PER_PAGE,
      action: actionFilter || undefined,
      resource: resourceFilter || undefined,
    });

    if (response.success && response.data) {
      setEntries(response.data.entries);
      setTotal(response.data.total);
    }

    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => {
    loadEntries();
  }, [page, actionFilter, resourceFilter]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadEntries();
  };

  const totalPages = Math.ceil(total / ITEMS_PER_PAGE);

  if (loading) {
    return (
      <div className="animate-pulse space-y-6">
        <div className="h-8 bg-muted rounded w-48" />
        <div className="space-y-4">
          {[...Array(10)].map((_, i) => (
            <div key={i} className="h-16 bg-muted rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Audit Log</h1>
          <p className="text-muted-foreground mt-1">
            Track all API activity and requests.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={refreshing}
        >
          <RefreshCw
            className={cn("w-4 h-4 mr-2", refreshing && "animate-spin")}
          />
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4">
        <div>
          <label className="text-sm text-muted-foreground mb-1 block">
            Action
          </label>
          <select
            value={actionFilter}
            onChange={(e) => {
              setActionFilter(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 bg-background border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="">All actions</option>
            <option value="create">Create</option>
            <option value="read">Read</option>
            <option value="update">Update</option>
            <option value="delete">Delete</option>
            <option value="search">Search</option>
            <option value="list">List</option>
          </select>
        </div>
        <div>
          <label className="text-sm text-muted-foreground mb-1 block">
            Resource
          </label>
          <select
            value={resourceFilter}
            onChange={(e) => {
              setResourceFilter(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 bg-background border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="">All resources</option>
            <option value="memory">Memory</option>
            <option value="session">Session</option>
            <option value="apikey">API Key</option>
            <option value="stats">Stats</option>
          </select>
        </div>
      </div>

      {/* Stats */}
      <div className="text-sm text-muted-foreground">
        {total} entries total
        {(actionFilter || resourceFilter) && (
          <Button
            variant="link"
            size="sm"
            className="ml-2"
            onClick={() => {
              setActionFilter("");
              setResourceFilter("");
              setPage(1);
            }}
          >
            Clear filters
          </Button>
        )}
      </div>

      {/* Audit Log Table */}
      <Card>
        <CardContent className="pt-6">
          {entries.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">
                No audit entries found. Activity will appear here as you use the
                API.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
                      Timestamp
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
                      Action
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
                      Resource
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
                      Endpoint
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
                      Status
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
                      Duration
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => (
                    <tr key={entry.id} className="border-b last:border-0 hover:bg-muted/50">
                      <td className="py-3 px-4 text-sm">
                        <span className="whitespace-nowrap">
                          {formatDate(entry.timestamp)}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={cn(
                            "text-xs px-2 py-1 rounded capitalize",
                            ACTION_COLORS[entry.action] || "bg-muted"
                          )}
                        >
                          {entry.action}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={cn(
                            "text-xs px-2 py-1 rounded capitalize",
                            RESOURCE_COLORS[entry.resource] || "bg-muted"
                          )}
                        >
                          {entry.resource}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">
                          {entry.method}
                        </span>
                        <span className="text-sm text-muted-foreground ml-2">
                          {entry.path}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={cn(
                            "text-xs px-2 py-1 rounded",
                            entry.statusCode < 400
                              ? "bg-green-500/10 text-green-500"
                              : "bg-red-500/10 text-red-500"
                          )}
                        >
                          {entry.statusCode}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-sm text-muted-foreground">
                        {entry.duration}ms
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            <ChevronLeft className="w-4 h-4 mr-1" />
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
          >
            Next
            <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      )}
    </div>
  );
}
