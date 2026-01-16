"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Search,
  Trash2,
  Database,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
} from "lucide-react";
import { api, Memory } from "@/lib/api";
import { formatRelativeTime } from "@/lib/utils";

const ITEMS_PER_PAGE = 20;

export default function MemoriesPage() {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalMemories, setTotalMemories] = useState(0);

  const loadMemories = async (search?: string) => {
    const apiKey = localStorage.getItem("recall_api_key");
    if (!apiKey) return;

    api.setApiKey(apiKey);

    if (search) {
      setSearching(true);
      const response = await api.searchMemories(search, 50);
      if (response.success && response.data) {
        setMemories(response.data);
        setTotalMemories(response.data.length);
      }
      setSearching(false);
    } else {
      const response = await api.getMemories(100);
      if (response.success && response.data) {
        setMemories(response.data);
        setTotalMemories(response.data.length);
      }
    }

    setLoading(false);
  };

  useEffect(() => {
    loadMemories();
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    loadMemories(searchQuery);
  };

  const handleClearSearch = () => {
    setSearchQuery("");
    loadMemories();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this memory? This cannot be undone.")) {
      return;
    }

    setDeleteLoading(id);
    setError(null);

    const response = await api.deleteMemory(id);

    if (response.success) {
      setMemories((prev) => prev.filter((m) => m.id !== id));
      setTotalMemories((prev) => prev - 1);
    } else {
      setError(response.error?.message || "Failed to delete memory");
    }

    setDeleteLoading(null);
  };

  const paginatedMemories = memories.slice(
    (page - 1) * ITEMS_PER_PAGE,
    page * ITEMS_PER_PAGE
  );

  const totalPages = Math.ceil(memories.length / ITEMS_PER_PAGE);

  if (loading) {
    return (
      <div className="animate-pulse space-y-6">
        <div className="h-8 bg-muted rounded w-48" />
        <div className="h-12 bg-muted rounded" />
        <div className="space-y-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-24 bg-muted rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Memories</h1>
        <p className="text-muted-foreground mt-1">
          Browse and manage your stored memories.
        </p>
      </div>

      {/* Search Bar */}
      <form onSubmit={handleSearch} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search memories semantically..."
            className="w-full pl-10 pr-4 py-2 bg-background border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <Button type="submit" disabled={searching}>
          {searching ? "Searching..." : "Search"}
        </Button>
        {searchQuery && (
          <Button type="button" variant="outline" onClick={handleClearSearch}>
            Clear
          </Button>
        )}
      </form>

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

      {/* Stats */}
      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <span>{totalMemories} memories total</span>
        {searchQuery && <span>Showing search results for &quot;{searchQuery}&quot;</span>}
      </div>

      {/* Memories List */}
      {memories.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-12">
              <Database className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">
                {searchQuery
                  ? "No memories found matching your search."
                  : "No memories stored yet. Use the API or MCP to create your first memory."}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {paginatedMemories.map((memory) => (
            <Card key={memory.id} className="hover:border-primary/50 transition-colors">
              <CardContent className="pt-6">
                <div className="flex items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm whitespace-pre-wrap">{memory.content}</p>

                    <div className="flex flex-wrap items-center gap-2 mt-4">
                      <span className="text-xs px-2 py-1 bg-primary/10 text-primary rounded">
                        {memory.context_type}
                      </span>
                      <span
                        className={`text-xs px-2 py-1 rounded ${
                          memory.importance >= 8
                            ? "bg-yellow-500/10 text-yellow-500"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        Importance: {memory.importance}
                      </span>
                      {memory.tags?.map((tag) => (
                        <span
                          key={tag}
                          className="text-xs px-2 py-1 bg-muted text-muted-foreground rounded"
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>

                    <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
                      <span>ID: {memory.id.substring(0, 8)}...</span>
                      <span>Created {formatRelativeTime(memory.created_at)}</span>
                    </div>
                  </div>

                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive flex-shrink-0"
                    onClick={() => handleDelete(memory.id)}
                    disabled={deleteLoading === memory.id}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

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
