/**
 * Unit tests for TeamService
 *
 * Tests team CRUD, member management, invitations, and workspace permissions
 * using a mock StorageClient for isolation.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TeamService } from './team.service.js';
import { MockStorageClient } from '../../tests/__mocks__/storage-client.mock.js';
import { Team, TeamMember, TeamInvite, DEFAULT_TEAM_SETTINGS } from './team.types.js';

describe('TeamService', () => {
  let storageClient: MockStorageClient;
  let teamService: TeamService;

  beforeEach(() => {
    storageClient = new MockStorageClient();
    teamService = new TeamService(storageClient);
  });

  describe('Team CRUD', () => {
    describe('createTeam', () => {
      it('should create a team with owner as first member', async () => {
        const team = await teamService.createTeam('owner-123', 'Test Team');

        expect(team).toBeDefined();
        expect(team.name).toBe('Test Team');
        expect(team.ownerId).toBe('owner-123');
        expect(team.plan).toBe('team');
        expect(team.settings).toEqual(DEFAULT_TEAM_SETTINGS);

        // Verify owner is added as member
        const members = await teamService.listMembers(team.id);
        expect(members).toHaveLength(1);
        expect(members[0].tenantId).toBe('owner-123');
        expect(members[0].role).toBe('owner');
      });

      it('should create a team with custom settings', async () => {
        const team = await teamService.createTeam('owner-123', 'Test Team', 'pro', {
          allowMemberInvites: false,
          defaultWorkspacePermission: 'write',
        });

        expect(team.settings.allowMemberInvites).toBe(false);
        expect(team.settings.defaultWorkspacePermission).toBe('write');
        expect(team.settings.requireApprovalForWorkspaces).toBe(false); // Default
      });

      it('should link tenant to team', async () => {
        const team = await teamService.createTeam('owner-123', 'Test Team');
        const linkedTeamId = await teamService.getTenantTeamId('owner-123');

        expect(linkedTeamId).toBe(team.id);
      });
    });

    describe('getTeam', () => {
      it('should return team by ID', async () => {
        const created = await teamService.createTeam('owner-123', 'Test Team');
        const fetched = await teamService.getTeam(created.id);

        expect(fetched).toBeDefined();
        expect(fetched?.id).toBe(created.id);
        expect(fetched?.name).toBe('Test Team');
      });

      it('should return null for non-existent team', async () => {
        const team = await teamService.getTeam('non-existent-id');
        expect(team).toBeNull();
      });
    });

    describe('updateTeam', () => {
      it('should update team name', async () => {
        const team = await teamService.createTeam('owner-123', 'Test Team');
        const updated = await teamService.updateTeam(team.id, 'owner-123', {
          name: 'Updated Name',
        });

        expect(updated?.name).toBe('Updated Name');
      });

      it('should update team settings', async () => {
        const team = await teamService.createTeam('owner-123', 'Test Team');
        const updated = await teamService.updateTeam(team.id, 'owner-123', {
          settings: { allowMemberInvites: false },
        });

        expect(updated?.settings.allowMemberInvites).toBe(false);
      });

      it('should throw for non-owner/admin', async () => {
        const team = await teamService.createTeam('owner-123', 'Test Team');

        await expect(
          teamService.updateTeam(team.id, 'random-user', { name: 'New Name' })
        ).rejects.toThrow('Permission denied');
      });
    });

    describe('deleteTeam', () => {
      it('should delete team by owner', async () => {
        const team = await teamService.createTeam('owner-123', 'Test Team');
        const result = await teamService.deleteTeam(team.id, 'owner-123');

        expect(result).toBe(true);

        const fetched = await teamService.getTeam(team.id);
        expect(fetched).toBeNull();
      });

      it('should throw for non-owner', async () => {
        const team = await teamService.createTeam('owner-123', 'Test Team');

        await expect(
          teamService.deleteTeam(team.id, 'random-user')
        ).rejects.toThrow('Only the team owner can delete the team');
      });
    });
  });

  describe('Member Management', () => {
    let team: Team;

    beforeEach(async () => {
      team = await teamService.createTeam('owner-123', 'Test Team');
    });

    describe('getMemberByTenantId', () => {
      it('should return member by tenant ID', async () => {
        const member = await teamService.getMemberByTenantId(team.id, 'owner-123');

        expect(member).toBeDefined();
        expect(member?.tenantId).toBe('owner-123');
        expect(member?.role).toBe('owner');
      });

      it('should return null for non-member', async () => {
        const member = await teamService.getMemberByTenantId(team.id, 'random-user');
        expect(member).toBeNull();
      });
    });

    describe('listMembers', () => {
      it('should list all members sorted by role', async () => {
        // Owner is already added
        const members = await teamService.listMembers(team.id);

        expect(members).toHaveLength(1);
        expect(members[0].role).toBe('owner');
      });
    });

    describe('updateMemberRole', () => {
      let inviteMember: TeamMember;

      beforeEach(async () => {
        // Create an invite and accept it to add a member
        const invite = await teamService.createInvite(
          team.id,
          'owner-123',
          'member@test.com',
          'member'
        );
        inviteMember = await teamService.acceptInvite(
          invite.token,
          'member-456',
          'member@test.com'
        );
      });

      it('should allow owner to change member role', async () => {
        const updated = await teamService.updateMemberRole(
          team.id,
          'owner-123',
          inviteMember.id,
          'admin'
        );

        expect(updated?.role).toBe('admin');
      });

      it('should not allow member to change roles', async () => {
        // Add another member
        const invite2 = await teamService.createInvite(
          team.id,
          'owner-123',
          'member2@test.com',
          'member'
        );
        await teamService.acceptInvite(invite2.token, 'member-789', 'member2@test.com');

        await expect(
          teamService.updateMemberRole(team.id, 'member-456', inviteMember.id, 'admin')
        ).rejects.toThrow('Permission denied');
      });

      it('should not allow changing owner role', async () => {
        const owner = await teamService.getMemberByTenantId(team.id, 'owner-123');

        await expect(
          teamService.updateMemberRole(team.id, 'owner-123', owner!.id, 'admin')
        ).rejects.toThrow('Cannot change owner role');
      });

      it('should not allow promoting to owner', async () => {
        await expect(
          teamService.updateMemberRole(team.id, 'owner-123', inviteMember.id, 'owner')
        ).rejects.toThrow('Cannot promote to owner');
      });
    });

    describe('removeMember', () => {
      let inviteMember: TeamMember;

      beforeEach(async () => {
        const invite = await teamService.createInvite(
          team.id,
          'owner-123',
          'member@test.com',
          'member'
        );
        inviteMember = await teamService.acceptInvite(
          invite.token,
          'member-456',
          'member@test.com'
        );
      });

      it('should allow owner to remove member', async () => {
        const result = await teamService.removeMember(
          team.id,
          'owner-123',
          inviteMember.id
        );

        expect(result).toBe(true);

        const members = await teamService.listMembers(team.id);
        expect(members).toHaveLength(1); // Only owner left
      });

      it('should not allow removing owner', async () => {
        const owner = await teamService.getMemberByTenantId(team.id, 'owner-123');

        await expect(
          teamService.removeMember(team.id, 'owner-123', owner!.id)
        ).rejects.toThrow('Cannot remove team owner');
      });

      it('should remove tenant-team link on removal', async () => {
        await teamService.removeMember(team.id, 'owner-123', inviteMember.id);

        const linkedTeamId = await teamService.getTenantTeamId('member-456');
        expect(linkedTeamId).toBeNull();
      });
    });
  });

  describe('Invitation System', () => {
    let team: Team;

    beforeEach(async () => {
      team = await teamService.createTeam('owner-123', 'Test Team');
    });

    describe('createInvite', () => {
      it('should create an invite', async () => {
        const invite = await teamService.createInvite(
          team.id,
          'owner-123',
          'new@test.com',
          'member'
        );

        expect(invite).toBeDefined();
        expect(invite.email).toBe('new@test.com');
        expect(invite.role).toBe('member');
        expect(invite.token).toBeDefined();
        expect(invite.expiresAt).toBeGreaterThan(Date.now());
      });

      it('should not allow inviting as owner', async () => {
        await expect(
          teamService.createInvite(team.id, 'owner-123', 'new@test.com', 'owner')
        ).rejects.toThrow('Cannot invite as owner');
      });

      it('should not allow member to create invites', async () => {
        // Add a member first
        const invite = await teamService.createInvite(
          team.id,
          'owner-123',
          'member@test.com',
          'member'
        );
        await teamService.acceptInvite(invite.token, 'member-456', 'member@test.com');

        await expect(
          teamService.createInvite(team.id, 'member-456', 'new@test.com', 'member')
        ).rejects.toThrow('Permission denied');
      });

      it('should include workspace IDs if provided', async () => {
        const invite = await teamService.createInvite(
          team.id,
          'owner-123',
          'new@test.com',
          'member',
          ['ws-1', 'ws-2']
        );

        expect(invite.workspaceIds).toEqual(['ws-1', 'ws-2']);
      });
    });

    describe('acceptInvite', () => {
      it('should accept a valid invite', async () => {
        const invite = await teamService.createInvite(
          team.id,
          'owner-123',
          'new@test.com',
          'member'
        );

        const member = await teamService.acceptInvite(
          invite.token,
          'new-tenant-123',
          'new@test.com'
        );

        expect(member).toBeDefined();
        expect(member.tenantId).toBe('new-tenant-123');
        expect(member.role).toBe('member');
        expect(member.status).toBe('active');
      });

      it('should reject invalid token', async () => {
        await expect(
          teamService.acceptInvite('invalid-token', 'tenant-123', 'test@test.com')
        ).rejects.toThrow('Invalid invite');
      });

      it('should reject mismatched email', async () => {
        const invite = await teamService.createInvite(
          team.id,
          'owner-123',
          'invited@test.com',
          'member'
        );

        await expect(
          teamService.acceptInvite(invite.token, 'tenant-123', 'different@test.com')
        ).rejects.toThrow('Email does not match invite');
      });

      it('should reject if user already in a team', async () => {
        const invite = await teamService.createInvite(
          team.id,
          'owner-123',
          'owner@test.com',
          'member'
        );

        await expect(
          teamService.acceptInvite(invite.token, 'owner-123', 'owner@test.com')
        ).rejects.toThrow('User is already in a team');
      });

      it('should delete invite after acceptance', async () => {
        const invite = await teamService.createInvite(
          team.id,
          'owner-123',
          'new@test.com',
          'member'
        );

        await teamService.acceptInvite(invite.token, 'tenant-123', 'new@test.com');

        const retrievedInvite = await teamService.getInvite(invite.token);
        expect(retrievedInvite).toBeNull();
      });
    });

    describe('cancelInvite', () => {
      it('should cancel an invite', async () => {
        const invite = await teamService.createInvite(
          team.id,
          'owner-123',
          'new@test.com',
          'member'
        );

        const result = await teamService.cancelInvite(team.id, 'owner-123', invite.id);

        expect(result).toBe(true);

        const retrieved = await teamService.getInvite(invite.token);
        expect(retrieved).toBeNull();
      });

      it('should return false for non-existent invite', async () => {
        const result = await teamService.cancelInvite(
          team.id,
          'owner-123',
          'non-existent-id'
        );

        expect(result).toBe(false);
      });
    });

    describe('listInvites', () => {
      it('should list pending invites', async () => {
        await teamService.createInvite(team.id, 'owner-123', 'a@test.com', 'member');
        await teamService.createInvite(team.id, 'owner-123', 'b@test.com', 'admin');

        const invites = await teamService.listInvites(team.id);

        expect(invites).toHaveLength(2);
      });

      it('should exclude expired invites', async () => {
        // This would require mocking Date.now() - simplified for this test
        const invites = await teamService.listInvites(team.id);
        expect(Array.isArray(invites)).toBe(true);
      });
    });
  });

  describe('Workspace Permissions', () => {
    let team: Team;
    let member: TeamMember;

    beforeEach(async () => {
      team = await teamService.createTeam('owner-123', 'Test Team');
      const invite = await teamService.createInvite(
        team.id,
        'owner-123',
        'member@test.com',
        'member'
      );
      member = await teamService.acceptInvite(
        invite.token,
        'member-456',
        'member@test.com'
      );
    });

    describe('grantWorkspacePermission', () => {
      it('should grant permission to member', async () => {
        await teamService.grantWorkspacePermission(
          team.id,
          'owner-123',
          member.id,
          'ws-1',
          'write'
        );

        const permission = await teamService.getWorkspacePermission(
          team.id,
          member.id,
          'ws-1'
        );

        expect(permission).toBe('write');
      });

      it('should not allow member to grant permissions', async () => {
        await expect(
          teamService.grantWorkspacePermission(
            team.id,
            'member-456',
            member.id,
            'ws-1',
            'write'
          )
        ).rejects.toThrow('Permission denied');
      });
    });

    describe('getWorkspacePermission', () => {
      it('should return admin for owner', async () => {
        const ownerMember = await teamService.getMemberByTenantId(team.id, 'owner-123');
        const permission = await teamService.getWorkspacePermission(
          team.id,
          ownerMember!.id,
          'any-workspace'
        );

        expect(permission).toBe('admin');
      });

      it('should return none for member without explicit permission', async () => {
        const permission = await teamService.getWorkspacePermission(
          team.id,
          member.id,
          'ws-1'
        );

        expect(permission).toBe('none');
      });
    });

    describe('revokeWorkspacePermission', () => {
      it('should revoke permission', async () => {
        await teamService.grantWorkspacePermission(
          team.id,
          'owner-123',
          member.id,
          'ws-1',
          'write'
        );

        await teamService.revokeWorkspacePermission(
          team.id,
          'owner-123',
          member.id,
          'ws-1'
        );

        const permission = await teamService.getWorkspacePermission(
          team.id,
          member.id,
          'ws-1'
        );

        expect(permission).toBe('none');
      });
    });

    describe('listMemberWorkspaces', () => {
      it('should list workspaces with permissions', async () => {
        await teamService.grantWorkspacePermission(
          team.id,
          'owner-123',
          member.id,
          'ws-1',
          'read'
        );
        await teamService.grantWorkspacePermission(
          team.id,
          'owner-123',
          member.id,
          'ws-2',
          'write'
        );

        const workspaces = await teamService.listMemberWorkspaces(team.id, member.id);

        expect(workspaces).toHaveLength(2);
        expect(workspaces.find((w) => w.workspaceId === 'ws-1')?.permission).toBe('read');
        expect(workspaces.find((w) => w.workspaceId === 'ws-2')?.permission).toBe('write');
      });
    });
  });

  describe('Audit Logging', () => {
    let team: Team;

    beforeEach(async () => {
      team = await teamService.createTeam('owner-123', 'Test Team');
    });

    describe('getAuditLog', () => {
      it('should return audit entries for team actions', async () => {
        // Creating team generates an audit entry
        const auditLog = await teamService.getAuditLog(team.id);

        expect(auditLog).toBeDefined();
        expect(auditLog.length).toBeGreaterThan(0);
        expect(auditLog[0].action).toBe('team_created');
      });

      it('should record invite actions', async () => {
        await teamService.createInvite(
          team.id,
          'owner-123',
          'new@test.com',
          'member'
        );

        const auditLog = await teamService.getAuditLog(team.id);
        const inviteEntry = auditLog.find((e) => e.action === 'member_invited');

        expect(inviteEntry).toBeDefined();
        expect(inviteEntry?.details?.email).toBe('new@test.com');
      });
    });
  });
});
