# Security Guidelines

## API Key Management

### Never Expose Keys

- Never log API keys, embedding provider keys, or Stripe secrets
- Never include keys in error messages returned to clients
- Never commit keys to the repository (use `.env` files, gitignored)
- Strip keys from stack traces before logging

```typescript
// Good: Redact key in error
throw new McpError(
  ErrorCode.InternalError,
  `Embedding provider ${providerName} failed: ${error.message}`
);

// Bad: Leaks key
throw new Error(`API call failed with key ${apiKey}: ${error.message}`);
```

### Environment Variable Handling

- Read keys from environment variables, never hardcode
- Validate key format on startup (e.g., `sk-recall-` prefix for SaaS keys)
- Use `EMBEDDING_PROVIDER` to force a specific provider, avoiding auto-detection surprises

## Tenant Isolation (SaaS/HTTP Transport)

### Redis Key Scoping

Every Redis operation in the HTTP transport MUST be scoped to the tenant:

```typescript
// Good: Tenant-scoped key
const key = `tenant:${tenantId}:workspace:${workspaceId}:memory:${memoryId}`;

// Bad: Global key (breaks tenant isolation)
const key = `memory:${memoryId}`;
```

### Session Isolation

- Each API key maps to exactly one tenant
- MCP sessions are tenant-scoped with 30min timeout
- Sessions cannot access other tenants' data
- Session cleanup must remove all tenant-scoped state

### Workspace Isolation

- Workspaces within a tenant are isolated by default (`WORKSPACE_MODE=isolated`)
- `global` mode shares memories across workspaces (user opt-in)
- `hybrid` mode stores globally but searches prefer local workspace

## Input Validation

### MCP Tool Inputs

All tool inputs MUST be validated through Zod schemas:

```typescript
// Good: Zod validation
const parsed = StoreMemorySchema.safeParse(args);
if (!parsed.success) {
  throw new McpError(ErrorCode.InvalidRequest, parsed.error.message);
}

// Bad: Direct access without validation
const content = args.content; // Could be undefined, wrong type, etc.
```

### HTTP Request Validation

- Validate `Authorization` header format (`Bearer sk-recall-xxx`)
- Validate request body against expected schemas
- Reject requests with unexpected fields (strict mode)

## Authentication

### API Key Authentication

- All HTTP endpoints require `Authorization: Bearer <key>` header
- API keys are hashed before storage (never stored in plaintext)
- Invalid keys return 401 with minimal error detail (no key echo)

### Stripe Webhooks

- Always verify webhook signatures using `STRIPE_WEBHOOK_SECRET`
- Reject webhooks with invalid or missing signatures
- Use raw body (not parsed JSON) for signature verification

### OAuth (Claude Desktop)

- OAuth tokens have limited scope and expiry
- Refresh tokens stored securely per tenant
- Token exchange happens server-side only

## Redis Security

### Connection Security

- Use `rediss://` (TLS) for remote Redis connections
- Require authentication (`AUTH` command) for production Redis
- Restrict network access with firewall rules

### Data at Rest

- SaaS uses AES-256-GCM encryption at rest
- Encryption keys are per-tenant (key isolation)
- Self-hosted users are responsible for their own encryption

## Rate Limiting & Resource Bounds

### Plan Limits

| Plan | Memory Limit |
|------|-------------|
| Free | 500 |
| Pro | 5,000 |
| Team | 25,000 |

- Enforce limits before storing (check count, then store)
- Return clear error messages when limits are hit
- Never allow bypassing limits through race conditions (use atomic operations)

### Session Limits

- Maximum concurrent sessions per tenant
- 30-minute session timeout with automatic cleanup
- Bounded session Map (prevent memory exhaustion)

### Embedding Provider Rate Limits

- Respect provider-specific rate limits
- Implement exponential backoff for transient failures
- Do not retry on authentication failures (fail fast)

## Sensitive Data in Logs

### Never Log

- API keys, embedding provider keys, Stripe secrets
- Raw memory content (may contain user secrets)
- User PII, email addresses, payment details
- OAuth tokens, session tokens

### Safe to Log

- Memory IDs, tenant IDs, workspace IDs
- Operation type (store, search, delete)
- Error types and codes (without sensitive context)
- Performance metrics (latency, count)
