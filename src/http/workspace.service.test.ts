import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WorkspaceService } from './workspace.service.js';
import { MockStorageClient } from '../__mocks__/storage-client.mock.js';

/**
 * Workspace registration limits: SaaS plan caps apply only where billing is configured;
 * a self-hosted deployment (no Stripe/Firebase) must not be capped at one workspace by the
 * plan string, and callers may pass their own effective limit.
 */
describe('WorkspaceService.getOrRegisterWorkspace limits', () => {
  let service: WorkspaceService;
  const env = { ...process.env };

  beforeEach(() => {
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.FIREBASE_PROJECT_ID;
    service = new WorkspaceService(new MockStorageClient() as any);
  });
  afterEach(() => {
    process.env = { ...env };
  });

  it('registers a second workspace on a self-hosted (no billing) deployment', async () => {
    expect(await service.getOrRegisterWorkspace('t1', '/home/me/projectA', 'free')).not.toBeNull();
    expect(await service.getOrRegisterWorkspace('t1', '/home/me/projectB', 'free')).not.toBeNull();
    expect(await service.getWorkspaceCount('t1')).toBe(2);
  });

  it('honours an explicit maxWorkspaces override', async () => {
    expect(await service.getOrRegisterWorkspace('t2', '/home/me/projectA', 'free', { maxWorkspaces: 1 })).not.toBeNull();
    expect(await service.getOrRegisterWorkspace('t2', '/home/me/projectB', 'free', { maxWorkspaces: 1 })).toBeNull();
    expect(await service.getOrRegisterWorkspace('t2', '/home/me/projectB', 'free', { maxWorkspaces: -1 })).not.toBeNull();
  });

  it('still applies the plan cap when billing is configured', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_x';
    process.env.FIREBASE_PROJECT_ID = 'proj';
    expect(await service.getOrRegisterWorkspace('t3', '/home/me/projectA', 'free')).not.toBeNull();
    expect(await service.getOrRegisterWorkspace('t3', '/home/me/projectB', 'free')).toBeNull();
    expect(await service.getOrRegisterWorkspace('t3', '/home/me/projectB', 'enterprise')).not.toBeNull();
  });
});
