/**
 * API Client
 *
 * Client for communicating with the Recall HTTP API.
 */

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

export interface Memory {
  id: string;
  content: string;
  context_type: string;
  importance: number;
  tags: string[];
  metadata?: Record<string, unknown>;
  created_at: number;
  updated_at: number;
}

export interface ApiKey {
  id: string;
  tenantId: string;
  apiKeyPreview: string;
  plan: "free" | "pro" | "team" | "enterprise";
  createdAt: number;
  lastUsedAt?: number;
  name?: string;
  usageCount: number;
  status: "active" | "revoked";
}

export interface AuditEntry {
  id: string;
  timestamp: number;
  action: string;
  resource: string;
  resourceId?: string;
  apiKeyId: string;
  tenantId: string;
  ip?: string;
  userAgent?: string;
  method: string;
  path: string;
  statusCode: number;
  duration: number;
  details?: Record<string, unknown>;
}

export interface TenantInfo {
  tenantId: string;
  plan: string;
  limits: {
    maxMemories: number;
    maxWorkspaces: number;
  };
  usage: {
    memories: number;
  };
}

export interface Stats {
  tenantId: string;
  plan: string;
  limits: {
    maxMemories: number;
    maxWorkspaces: number;
  };
  usage: {
    total_memories: number;
    context_types: Record<string, number>;
    tags: Record<string, number>;
  };
}

class ApiClient {
  private apiKey: string | null = null;

  setApiKey(key: string) {
    this.apiKey = key;
  }

  clearApiKey() {
    this.apiKey = null;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const headers: HeadersInit = {
      "Content-Type": "application/json",
      ...(this.apiKey && { Authorization: `Bearer ${this.apiKey}` }),
      ...options.headers,
    };

    try {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        ...options,
        headers,
      });

      const data = await response.json();
      return data;
    } catch (error) {
      return {
        success: false,
        error: {
          code: "NETWORK_ERROR",
          message:
            error instanceof Error ? error.message : "Network request failed",
        },
      };
    }
  }

  // Memories
  async getMemories(limit = 50): Promise<ApiResponse<Memory[]>> {
    return this.request<Memory[]>(`/api/memories?limit=${limit}`);
  }

  async getMemory(id: string): Promise<ApiResponse<Memory>> {
    return this.request<Memory>(`/api/memories/${id}`);
  }

  async searchMemories(
    query: string,
    limit = 10
  ): Promise<ApiResponse<Memory[]>> {
    return this.request<Memory[]>(
      `/api/memories/search?q=${encodeURIComponent(query)}&limit=${limit}`
    );
  }

  async createMemory(
    memory: Partial<Memory>
  ): Promise<ApiResponse<Memory>> {
    return this.request<Memory>("/api/memories", {
      method: "POST",
      body: JSON.stringify(memory),
    });
  }

  async deleteMemory(id: string): Promise<ApiResponse<{ deleted: string }>> {
    return this.request<{ deleted: string }>(`/api/memories/${id}`, {
      method: "DELETE",
    });
  }

  // API Keys
  async getApiKeys(): Promise<ApiResponse<ApiKey[]>> {
    return this.request<ApiKey[]>("/api/keys");
  }

  async revokeApiKey(id: string): Promise<ApiResponse<{ revoked: string }>> {
    return this.request<{ revoked: string }>(`/api/keys/${id}`, {
      method: "DELETE",
    });
  }

  async regenerateApiKey(
    id: string
  ): Promise<ApiResponse<{ apiKey: string; id: string; message: string }>> {
    return this.request<{ apiKey: string; id: string; message: string }>(
      `/api/keys/${id}/regenerate`,
      { method: "POST" }
    );
  }

  // Audit
  async getAuditEntries(params?: {
    limit?: number;
    offset?: number;
    action?: string;
    resource?: string;
  }): Promise<
    ApiResponse<{ entries: AuditEntry[]; total: number; limit: number; offset: number }>
  > {
    const searchParams = new URLSearchParams();
    if (params?.limit) searchParams.set("limit", params.limit.toString());
    if (params?.offset) searchParams.set("offset", params.offset.toString());
    if (params?.action) searchParams.set("action", params.action);
    if (params?.resource) searchParams.set("resource", params.resource);

    return this.request<{
      entries: AuditEntry[];
      total: number;
      limit: number;
      offset: number;
    }>(`/api/audit?${searchParams.toString()}`);
  }

  // Tenant Info
  async getMe(): Promise<ApiResponse<TenantInfo>> {
    return this.request<TenantInfo>("/api/me");
  }

  async getStats(): Promise<ApiResponse<Stats>> {
    return this.request<Stats>("/api/stats");
  }
}

export const api = new ApiClient();
