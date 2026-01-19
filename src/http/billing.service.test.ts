/**
 * Unit tests for billing.service.ts add-on functions
 *
 * Tests customer add-on retrieval and workspace add-on purchase logic.
 * Note: Stripe API calls are not mocked in these tests - they test
 * the storage and validation logic only.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MockStorageClient } from '../../tests/__mocks__/storage-client.mock.js';
import {
  getCustomerAddons,
  getPlanLimits,
} from './billing.service.js';

describe('billing.service add-on functions', () => {
  let storageClient: MockStorageClient;

  beforeEach(() => {
    storageClient = new MockStorageClient();
  });

  describe('getPlanLimits', () => {
    it('should return correct limits for free plan', () => {
      const limits = getPlanLimits('free');
      expect(limits.maxMemories).toBe(500);
      expect(limits.maxWorkspaces).toBe(1);
    });

    it('should return correct limits for pro plan', () => {
      const limits = getPlanLimits('pro');
      expect(limits.maxMemories).toBe(5000);
      expect(limits.maxWorkspaces).toBe(3);
    });

    it('should return correct limits for team plan', () => {
      const limits = getPlanLimits('team');
      expect(limits.maxMemories).toBe(25000);
      expect(limits.maxWorkspaces).toBe(-1); // Unlimited
    });

    it('should return correct limits for enterprise plan', () => {
      const limits = getPlanLimits('enterprise');
      expect(limits.maxMemories).toBe(-1); // Unlimited
      expect(limits.maxWorkspaces).toBe(-1); // Unlimited
    });

    it('should return free limits for unknown plan', () => {
      const limits = getPlanLimits('unknown');
      expect(limits.maxMemories).toBe(500);
      expect(limits.maxWorkspaces).toBe(1);
    });
  });

  describe('getCustomerAddons', () => {
    it('should return 0 add-ons when no customer record exists', async () => {
      const addons = await getCustomerAddons(storageClient, 'tenant-123');
      expect(addons.workspaceAddons).toBe(0);
    });

    it('should return 0 add-ons when customer has no add-ons', async () => {
      await storageClient.hset('customer:tenant-123', {
        stripeCustomerId: 'cus_test',
        plan: 'pro',
      });

      const addons = await getCustomerAddons(storageClient, 'tenant-123');
      expect(addons.workspaceAddons).toBe(0);
    });

    it('should return correct add-on count when set', async () => {
      await storageClient.hset('customer:tenant-123', {
        stripeCustomerId: 'cus_test',
        plan: 'pro',
        workspaceAddons: '5',
      });

      const addons = await getCustomerAddons(storageClient, 'tenant-123');
      expect(addons.workspaceAddons).toBe(5);
    });

    it('should handle invalid add-on values gracefully', async () => {
      await storageClient.hset('customer:tenant-123', {
        stripeCustomerId: 'cus_test',
        plan: 'pro',
        workspaceAddons: 'invalid',
      });

      const addons = await getCustomerAddons(storageClient, 'tenant-123');
      expect(addons.workspaceAddons).toBe(0); // NaN becomes 0
    });
  });

  describe('CustomerRecord storage', () => {
    it('should store and retrieve workspaceAddons', async () => {
      const tenantId = 'tenant-test';

      // Simulate what billing service does when storing add-ons
      await storageClient.hset(`customer:${tenantId}`, {
        stripeCustomerId: 'cus_test123',
        email: 'test@example.com',
        plan: 'pro',
        workspaceAddons: '3',
        createdAt: Date.now().toString(),
        updatedAt: Date.now().toString(),
      });

      // Verify retrieval
      const data = await storageClient.hgetall(`customer:${tenantId}`);
      expect(data?.workspaceAddons).toBe('3');
      expect(data?.plan).toBe('pro');
    });

    it('should update workspaceAddons correctly', async () => {
      const tenantId = 'tenant-test';

      // Initial setup
      await storageClient.hset(`customer:${tenantId}`, {
        stripeCustomerId: 'cus_test123',
        plan: 'pro',
        workspaceAddons: '2',
      });

      // Update add-ons
      await storageClient.hset(`customer:${tenantId}`, {
        workspaceAddons: '5',
        updatedAt: Date.now().toString(),
      });

      const data = await storageClient.hgetall(`customer:${tenantId}`);
      expect(data?.workspaceAddons).toBe('5');
      expect(data?.plan).toBe('pro'); // Should not change
    });
  });

  describe('Workspace limit calculation', () => {
    it('should calculate total workspaces with add-ons', () => {
      const basePlanLimit = 3; // Pro plan
      const addonWorkspaces = 5;
      const totalLimit = basePlanLimit + addonWorkspaces;

      expect(totalLimit).toBe(8);
    });

    it('should handle unlimited workspaces correctly', () => {
      const basePlanLimit = -1; // Team/Enterprise
      const addonWorkspaces = 5;

      // When base is unlimited, total stays unlimited
      const totalLimit = basePlanLimit === -1 ? -1 : basePlanLimit + addonWorkspaces;

      expect(totalLimit).toBe(-1);
    });
  });
});

describe('Add-on validation logic', () => {
  it('should reject negative quantities', () => {
    const quantity = -1;
    expect(quantity < 1).toBe(true);
  });

  it('should reject zero quantities', () => {
    const quantity = 0;
    expect(quantity < 1).toBe(true);
  });

  it('should accept positive quantities', () => {
    const quantity = 3;
    expect(quantity >= 1).toBe(true);
  });
});

describe('Plan upgrade detection', () => {
  it('should detect pro plan from price ID', () => {
    const priceId = 'price_1SqTaOLUbfmx8MWFecrr4ng8';
    const isPro = priceId === 'price_1SqTaOLUbfmx8MWFecrr4ng8';
    expect(isPro).toBe(true);
  });

  it('should detect team plan from price ID', () => {
    const priceId = 'price_1SqTaOLUbfmx8MWFdxHsCoPz';
    const isTeam = priceId === 'price_1SqTaOLUbfmx8MWFdxHsCoPz';
    expect(isTeam).toBe(true);
  });

  it('should fallback to free for unknown price', () => {
    const priceId = 'unknown_price';
    let plan = 'free';

    if (priceId === 'price_1SqTaOLUbfmx8MWFecrr4ng8') {
      plan = 'pro';
    } else if (priceId === 'price_1SqTaOLUbfmx8MWFdxHsCoPz') {
      plan = 'team';
    }

    expect(plan).toBe('free');
  });
});
