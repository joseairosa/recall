/**
 * Unit tests for team.types.ts helper functions
 */

import { describe, it, expect } from 'vitest';
import {
  hasPermission,
  canModifyRole,
  getRoleLevel,
  canWriteToWorkspace,
  canManageWorkspace,
  ROLE_PERMISSIONS,
  DEFAULT_TEAM_SETTINGS,
  TeamRole,
  WorkspacePermission,
} from './team.types.js';

describe('team.types helper functions', () => {
  describe('hasPermission', () => {
    it('should return true for owner permissions', () => {
      expect(hasPermission('owner', 'canInviteMembers')).toBe(true);
      expect(hasPermission('owner', 'canRemoveMembers')).toBe(true);
      expect(hasPermission('owner', 'canChangeRoles')).toBe(true);
      expect(hasPermission('owner', 'canDeleteTeam')).toBe(true);
      expect(hasPermission('owner', 'canManageBilling')).toBe(true);
      expect(hasPermission('owner', 'canAccessAllWorkspaces')).toBe(true);
    });

    it('should return correct permissions for admin', () => {
      expect(hasPermission('admin', 'canInviteMembers')).toBe(true);
      expect(hasPermission('admin', 'canRemoveMembers')).toBe(true);
      expect(hasPermission('admin', 'canChangeRoles')).toBe(true);
      expect(hasPermission('admin', 'canDeleteTeam')).toBe(false);
      expect(hasPermission('admin', 'canManageBilling')).toBe(false);
      expect(hasPermission('admin', 'canAccessAllWorkspaces')).toBe(true);
    });

    it('should return correct permissions for member', () => {
      expect(hasPermission('member', 'canInviteMembers')).toBe(false);
      expect(hasPermission('member', 'canRemoveMembers')).toBe(false);
      expect(hasPermission('member', 'canCreateApiKeys')).toBe(true);
      expect(hasPermission('member', 'canAccessAllWorkspaces')).toBe(false);
    });

    it('should return correct permissions for viewer', () => {
      expect(hasPermission('viewer', 'canInviteMembers')).toBe(false);
      expect(hasPermission('viewer', 'canRemoveMembers')).toBe(false);
      expect(hasPermission('viewer', 'canChangeRoles')).toBe(false);
      expect(hasPermission('viewer', 'canCreateApiKeys')).toBe(true);
      expect(hasPermission('viewer', 'canAccessAllWorkspaces')).toBe(false);
    });
  });

  describe('canModifyRole', () => {
    it('should allow owner to modify any role', () => {
      expect(canModifyRole('owner', 'admin')).toBe(true);
      expect(canModifyRole('owner', 'member')).toBe(true);
      expect(canModifyRole('owner', 'viewer')).toBe(true);
      expect(canModifyRole('owner', 'owner')).toBe(true); // Can modify self
    });

    it('should allow admin to modify member and viewer only', () => {
      expect(canModifyRole('admin', 'member')).toBe(true);
      expect(canModifyRole('admin', 'viewer')).toBe(true);
      expect(canModifyRole('admin', 'admin')).toBe(false);
      expect(canModifyRole('admin', 'owner')).toBe(false);
    });

    it('should not allow member to modify any role', () => {
      expect(canModifyRole('member', 'viewer')).toBe(false);
      expect(canModifyRole('member', 'member')).toBe(false);
      expect(canModifyRole('member', 'admin')).toBe(false);
      expect(canModifyRole('member', 'owner')).toBe(false);
    });

    it('should not allow viewer to modify any role', () => {
      expect(canModifyRole('viewer', 'viewer')).toBe(false);
      expect(canModifyRole('viewer', 'member')).toBe(false);
      expect(canModifyRole('viewer', 'admin')).toBe(false);
      expect(canModifyRole('viewer', 'owner')).toBe(false);
    });
  });

  describe('getRoleLevel', () => {
    it('should return correct hierarchy levels', () => {
      expect(getRoleLevel('viewer')).toBe(1);
      expect(getRoleLevel('member')).toBe(2);
      expect(getRoleLevel('admin')).toBe(3);
      expect(getRoleLevel('owner')).toBe(4);
    });

    it('should maintain hierarchy order', () => {
      expect(getRoleLevel('owner')).toBeGreaterThan(getRoleLevel('admin'));
      expect(getRoleLevel('admin')).toBeGreaterThan(getRoleLevel('member'));
      expect(getRoleLevel('member')).toBeGreaterThan(getRoleLevel('viewer'));
    });
  });

  describe('canWriteToWorkspace', () => {
    it('should return true for write and admin permissions', () => {
      expect(canWriteToWorkspace('write')).toBe(true);
      expect(canWriteToWorkspace('admin')).toBe(true);
    });

    it('should return false for read and none permissions', () => {
      expect(canWriteToWorkspace('read')).toBe(false);
      expect(canWriteToWorkspace('none')).toBe(false);
    });
  });

  describe('canManageWorkspace', () => {
    it('should return true only for admin permission', () => {
      expect(canManageWorkspace('admin')).toBe(true);
    });

    it('should return false for non-admin permissions', () => {
      expect(canManageWorkspace('write')).toBe(false);
      expect(canManageWorkspace('read')).toBe(false);
      expect(canManageWorkspace('none')).toBe(false);
    });
  });

  describe('ROLE_PERMISSIONS', () => {
    it('should have all four roles defined', () => {
      expect(Object.keys(ROLE_PERMISSIONS)).toHaveLength(4);
      expect(ROLE_PERMISSIONS).toHaveProperty('owner');
      expect(ROLE_PERMISSIONS).toHaveProperty('admin');
      expect(ROLE_PERMISSIONS).toHaveProperty('member');
      expect(ROLE_PERMISSIONS).toHaveProperty('viewer');
    });

    it('should have all permission properties for each role', () => {
      const expectedPermissions = [
        'canInviteMembers',
        'canRemoveMembers',
        'canChangeRoles',
        'canManageWorkspacePermissions',
        'canDeleteTeam',
        'canManageBilling',
        'canCreateApiKeys',
        'canAccessAllWorkspaces',
      ];

      for (const role of Object.keys(ROLE_PERMISSIONS) as TeamRole[]) {
        for (const perm of expectedPermissions) {
          expect(ROLE_PERMISSIONS[role]).toHaveProperty(perm);
        }
      }
    });
  });

  describe('DEFAULT_TEAM_SETTINGS', () => {
    it('should have correct default values', () => {
      expect(DEFAULT_TEAM_SETTINGS.allowMemberInvites).toBe(true);
      expect(DEFAULT_TEAM_SETTINGS.defaultWorkspacePermission).toBe('read');
      expect(DEFAULT_TEAM_SETTINGS.requireApprovalForWorkspaces).toBe(false);
    });
  });
});
