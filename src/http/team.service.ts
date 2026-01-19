/**
 * Team Service
 *
 * Manages team CRUD operations, member management, invitations,
 * and workspace permissions for Recall SaaS.
 */

import { randomBytes } from 'crypto';
import { ulid } from 'ulid';
import { StorageClient } from '../persistence/storage-client.js';
import {
  Team,
  TeamMember,
  TeamInvite,
  TeamAuditEntry,
  TeamAuditAction,
  TeamSettings,
  TeamRole,
  WorkspacePermission,
  DEFAULT_TEAM_SETTINGS,
  hasPermission,
  canModifyRole,
} from './team.types.js';
import { PLAN_LIMITS } from './types.js';

// Invite token expiry: 7 days
const INVITE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

export class TeamService {
  private storageClient: StorageClient;

  constructor(storageClient: StorageClient) {
    this.storageClient = storageClient;
  }

  // ============================================
  // Team CRUD
  // ============================================

  /**
   * Create a new team
   */
  async createTeam(
    ownerId: string,
    name: string,
    plan: Team['plan'] = 'team',
    settings?: Partial<TeamSettings>
  ): Promise<Team> {
    const id = ulid();
    const now = Date.now();

    const team: Team = {
      id,
      name,
      ownerId,
      plan,
      createdAt: now,
      updatedAt: now,
      settings: { ...DEFAULT_TEAM_SETTINGS, ...settings },
    };

    // Store team
    await this.storageClient.hset(`team:${id}`, this.serializeTeam(team));

    // Add owner as first member
    const ownerMember: TeamMember = {
      id: ulid(),
      teamId: id,
      tenantId: ownerId,
      email: '', // Will be updated when we have email
      role: 'owner',
      invitedBy: ownerId,
      invitedAt: now,
      joinedAt: now,
      status: 'active',
    };
    await this.addMemberRecord(ownerMember);

    // Link tenant to team
    await this.storageClient.set(`tenant:${ownerId}:team`, id);

    // Audit log
    await this.logAudit(id, 'team_created', ownerId);

    console.log(`[Team] Created team ${id} for owner ${ownerId}`);
    return team;
  }

  /**
   * Get team by ID
   */
  async getTeam(teamId: string): Promise<Team | null> {
    const data = await this.storageClient.hgetall(`team:${teamId}`);
    if (!data || Object.keys(data).length === 0) {
      return null;
    }
    return this.deserializeTeam(data);
  }

  /**
   * Get team ID for a tenant
   */
  async getTenantTeamId(tenantId: string): Promise<string | null> {
    return this.storageClient.get(`tenant:${tenantId}:team`);
  }

  /**
   * Get team ID for a tenant (alias for getTenantTeamId)
   * Used by auth middleware
   */
  async getTeamForTenant(tenantId: string): Promise<string | null> {
    return this.getTenantTeamId(tenantId);
  }

  /**
   * Update team settings
   */
  async updateTeam(
    teamId: string,
    actorId: string,
    updates: Partial<Pick<Team, 'name' | 'settings'>>
  ): Promise<Team | null> {
    // Verify actor has permission
    const member = await this.getMemberByTenantId(teamId, actorId);
    if (!member || !hasPermission(member.role, 'canManageWorkspacePermissions')) {
      throw new Error('Permission denied');
    }

    const team = await this.getTeam(teamId);
    if (!team) {
      return null;
    }

    const now = Date.now();
    const updatedTeam: Team = {
      ...team,
      name: updates.name ?? team.name,
      settings: updates.settings
        ? { ...team.settings, ...updates.settings }
        : team.settings,
      updatedAt: now,
    };

    await this.storageClient.hset(`team:${teamId}`, this.serializeTeam(updatedTeam));
    await this.logAudit(teamId, 'team_updated', actorId);

    return updatedTeam;
  }

  /**
   * Delete team (owner only)
   */
  async deleteTeam(teamId: string, actorId: string): Promise<boolean> {
    const team = await this.getTeam(teamId);
    if (!team || team.ownerId !== actorId) {
      throw new Error('Only the team owner can delete the team');
    }

    // Remove all members
    const members = await this.listMembers(teamId);
    for (const member of members) {
      await this.storageClient.del(`tenant:${member.tenantId}:team`);
    }

    // Delete team data
    await this.storageClient.del(`team:${teamId}`);
    await this.storageClient.del(`team:${teamId}:members`);

    // Delete all member records
    const memberIds = await this.storageClient.smembers(`team:${teamId}:members`);
    for (const memberId of memberIds) {
      await this.storageClient.del(`team:${teamId}:member:${memberId}`);
    }

    // Delete all invites
    const inviteTokens = await this.storageClient.smembers(`team:${teamId}:invites`);
    for (const token of inviteTokens) {
      await this.storageClient.del(`invite:${token}`);
    }
    await this.storageClient.del(`team:${teamId}:invites`);

    await this.logAudit(teamId, 'team_deleted', actorId);
    console.log(`[Team] Deleted team ${teamId}`);

    return true;
  }

  // ============================================
  // Member Management
  // ============================================

  /**
   * Add a member record (internal)
   */
  private async addMemberRecord(member: TeamMember): Promise<void> {
    await this.storageClient.hset(
      `team:${member.teamId}:member:${member.id}`,
      this.serializeMember(member)
    );
    await this.storageClient.sadd(`team:${member.teamId}:members`, member.id);
  }

  /**
   * Get member by ID
   */
  async getMember(teamId: string, memberId: string): Promise<TeamMember | null> {
    const data = await this.storageClient.hgetall(
      `team:${teamId}:member:${memberId}`
    );
    if (!data || Object.keys(data).length === 0) {
      return null;
    }
    return this.deserializeMember(data);
  }

  /**
   * Get member by tenant ID
   */
  async getMemberByTenantId(
    teamId: string,
    tenantId: string
  ): Promise<TeamMember | null> {
    const members = await this.listMembers(teamId);
    return members.find((m) => m.tenantId === tenantId) || null;
  }

  /**
   * List all team members
   */
  async listMembers(teamId: string): Promise<TeamMember[]> {
    const memberIds = await this.storageClient.smembers(`team:${teamId}:members`);
    const members: TeamMember[] = [];

    for (const memberId of memberIds) {
      const member = await this.getMember(teamId, memberId);
      if (member) {
        members.push(member);
      }
    }

    return members.sort((a, b) => {
      // Sort by role (owner first), then by joinedAt
      const roleOrder = { owner: 0, admin: 1, member: 2, viewer: 3 };
      const roleCompare = roleOrder[a.role] - roleOrder[b.role];
      if (roleCompare !== 0) return roleCompare;
      return (a.joinedAt || a.invitedAt) - (b.joinedAt || b.invitedAt);
    });
  }

  /**
   * Update member role
   */
  async updateMemberRole(
    teamId: string,
    actorId: string,
    memberId: string,
    newRole: TeamRole
  ): Promise<TeamMember | null> {
    const actor = await this.getMemberByTenantId(teamId, actorId);
    if (!actor || !hasPermission(actor.role, 'canChangeRoles')) {
      throw new Error('Permission denied');
    }

    const member = await this.getMember(teamId, memberId);
    if (!member) {
      return null;
    }

    // Check if actor can modify target's role
    if (!canModifyRole(actor.role, member.role)) {
      throw new Error('Cannot modify this member\'s role');
    }

    // Cannot change owner role
    if (member.role === 'owner') {
      throw new Error('Cannot change owner role');
    }

    // Cannot promote to owner (ownership transfer is different)
    if (newRole === 'owner') {
      throw new Error('Cannot promote to owner. Use ownership transfer instead.');
    }

    const updatedMember: TeamMember = { ...member, role: newRole };
    await this.storageClient.hset(
      `team:${teamId}:member:${memberId}`,
      this.serializeMember(updatedMember)
    );

    await this.logAudit(teamId, 'member_role_changed', actorId, memberId, {
      oldRole: member.role,
      newRole,
    });

    return updatedMember;
  }

  /**
   * Remove member from team
   */
  async removeMember(
    teamId: string,
    actorId: string,
    memberId: string
  ): Promise<boolean> {
    const actor = await this.getMemberByTenantId(teamId, actorId);
    if (!actor || !hasPermission(actor.role, 'canRemoveMembers')) {
      throw new Error('Permission denied');
    }

    const member = await this.getMember(teamId, memberId);
    if (!member) {
      return false;
    }

    // Cannot remove owner
    if (member.role === 'owner') {
      throw new Error('Cannot remove team owner');
    }

    // Remove member record
    await this.storageClient.del(`team:${teamId}:member:${memberId}`);
    await this.storageClient.srem(`team:${teamId}:members`, memberId);

    // Remove tenant->team link
    await this.storageClient.del(`tenant:${member.tenantId}:team`);

    // Remove workspace permissions
    const wsPermsKey = `team:${teamId}:member:${memberId}:workspaces`;
    const workspaceIds = await this.storageClient.smembers(wsPermsKey);
    for (const wsId of workspaceIds) {
      await this.storageClient.hdel(
        `team:${teamId}:workspace:${wsId}:members`,
        memberId
      );
    }
    await this.storageClient.del(wsPermsKey);

    await this.logAudit(teamId, 'member_removed', actorId, memberId);
    console.log(`[Team] Removed member ${memberId} from team ${teamId}`);

    return true;
  }

  // ============================================
  // Invitation System
  // ============================================

  /**
   * Create an invite for a new member
   */
  async createInvite(
    teamId: string,
    actorId: string,
    email: string,
    role: TeamRole,
    workspaceIds?: string[]
  ): Promise<TeamInvite> {
    const actor = await this.getMemberByTenantId(teamId, actorId);
    if (!actor || !hasPermission(actor.role, 'canInviteMembers')) {
      throw new Error('Permission denied');
    }

    // Cannot invite as owner
    if (role === 'owner') {
      throw new Error('Cannot invite as owner');
    }

    // Check if already a member
    const existingMembers = await this.listMembers(teamId);
    const alreadyMember = existingMembers.find(
      (m) => m.email.toLowerCase() === email.toLowerCase() && m.status === 'active'
    );
    if (alreadyMember) {
      throw new Error('User is already a team member');
    }

    // Check team member limit based on plan
    const team = await this.getTeam(teamId);
    if (team) {
      const planLimits = PLAN_LIMITS[team.plan as keyof typeof PLAN_LIMITS] || PLAN_LIMITS.free;
      const maxMembers = planLimits.maxTeamMembers;

      if (maxMembers !== -1) {
        // Count active members + pending invites
        const activeMembers = existingMembers.filter((m) => m.status === 'active').length;
        const pendingInvites = await this.listInvites(teamId);

        if (activeMembers + pendingInvites.length >= maxMembers) {
          throw new Error(
            `Team member limit reached (${maxMembers} members). Upgrade to Enterprise for unlimited members.`
          );
        }
      }
    }

    const id = ulid();
    const token = this.generateSecureToken(32);
    const now = Date.now();

    const invite: TeamInvite = {
      id,
      teamId,
      email: email.toLowerCase(),
      role,
      invitedBy: actorId,
      createdAt: now,
      expiresAt: now + INVITE_EXPIRY_MS,
      token,
      workspaceIds,
    };

    // Store invite by token for quick lookup
    await this.storageClient.hset(`invite:${token}`, this.serializeInvite(invite));
    await this.storageClient.sadd(`team:${teamId}:invites`, token);

    await this.logAudit(teamId, 'member_invited', actorId, undefined, {
      email,
      role,
    });

    console.log(`[Team] Created invite for ${email} to team ${teamId}`);
    return invite;
  }

  /**
   * Get invite by token
   */
  async getInvite(token: string): Promise<TeamInvite | null> {
    const data = await this.storageClient.hgetall(`invite:${token}`);
    if (!data || Object.keys(data).length === 0) {
      return null;
    }
    return this.deserializeInvite(data);
  }

  /**
   * Accept an invite
   */
  async acceptInvite(
    token: string,
    tenantId: string,
    email: string,
    name?: string
  ): Promise<TeamMember> {
    const invite = await this.getInvite(token);
    if (!invite) {
      throw new Error('Invalid invite');
    }

    if (Date.now() > invite.expiresAt) {
      throw new Error('Invite has expired');
    }

    // Verify email matches (case-insensitive)
    if (email.toLowerCase() !== invite.email.toLowerCase()) {
      throw new Error('Email does not match invite');
    }

    // Check if user is already in a team
    const existingTeamId = await this.getTenantTeamId(tenantId);
    if (existingTeamId) {
      throw new Error('User is already in a team');
    }

    const now = Date.now();
    const memberId = ulid();

    const member: TeamMember = {
      id: memberId,
      teamId: invite.teamId,
      tenantId,
      email: email.toLowerCase(),
      name,
      role: invite.role,
      invitedBy: invite.invitedBy,
      invitedAt: invite.createdAt,
      joinedAt: now,
      status: 'active',
    };

    // Add member
    await this.addMemberRecord(member);

    // Link tenant to team
    await this.storageClient.set(`tenant:${tenantId}:team`, invite.teamId);

    // Grant workspace permissions if specified
    if (invite.workspaceIds) {
      for (const wsId of invite.workspaceIds) {
        await this.grantWorkspacePermission(
          invite.teamId,
          invite.invitedBy,
          memberId,
          wsId,
          'write'
        );
      }
    }

    // Delete the invite
    await this.storageClient.del(`invite:${token}`);
    await this.storageClient.srem(`team:${invite.teamId}:invites`, token);

    await this.logAudit(invite.teamId, 'member_joined', tenantId, memberId);
    console.log(`[Team] ${email} joined team ${invite.teamId}`);

    return member;
  }

  /**
   * Cancel an invite
   */
  async cancelInvite(
    teamId: string,
    actorId: string,
    inviteId: string
  ): Promise<boolean> {
    const actor = await this.getMemberByTenantId(teamId, actorId);
    if (!actor || !hasPermission(actor.role, 'canInviteMembers')) {
      throw new Error('Permission denied');
    }

    // Find invite by ID
    const inviteTokens = await this.storageClient.smembers(`team:${teamId}:invites`);
    for (const token of inviteTokens) {
      const invite = await this.getInvite(token);
      if (invite && invite.id === inviteId) {
        await this.storageClient.del(`invite:${token}`);
        await this.storageClient.srem(`team:${teamId}:invites`, token);
        return true;
      }
    }

    return false;
  }

  /**
   * List pending invites for a team
   */
  async listInvites(teamId: string): Promise<TeamInvite[]> {
    const tokens = await this.storageClient.smembers(`team:${teamId}:invites`);
    const invites: TeamInvite[] = [];
    const now = Date.now();

    for (const token of tokens) {
      const invite = await this.getInvite(token);
      if (invite) {
        // Skip expired invites
        if (invite.expiresAt > now) {
          invites.push(invite);
        }
      }
    }

    return invites.sort((a, b) => b.createdAt - a.createdAt);
  }

  // ============================================
  // Workspace Permissions
  // ============================================

  /**
   * Grant workspace permission to a member
   */
  async grantWorkspacePermission(
    teamId: string,
    actorId: string,
    memberId: string,
    workspaceId: string,
    permission: WorkspacePermission
  ): Promise<void> {
    const actor = await this.getMemberByTenantId(teamId, actorId);
    if (!actor || !hasPermission(actor.role, 'canManageWorkspacePermissions')) {
      throw new Error('Permission denied');
    }

    // Store permission in workspace->members hash
    await this.storageClient.hset(
      `team:${teamId}:workspace:${workspaceId}:members`,
      { [memberId]: permission }
    );

    // Track which workspaces member has access to
    await this.storageClient.sadd(
      `team:${teamId}:member:${memberId}:workspaces`,
      workspaceId
    );

    await this.logAudit(teamId, 'workspace_permission_granted', actorId, memberId, {
      workspaceId,
      permission,
    });
  }

  /**
   * Revoke workspace permission from a member
   */
  async revokeWorkspacePermission(
    teamId: string,
    actorId: string,
    memberId: string,
    workspaceId: string
  ): Promise<void> {
    const actor = await this.getMemberByTenantId(teamId, actorId);
    if (!actor || !hasPermission(actor.role, 'canManageWorkspacePermissions')) {
      throw new Error('Permission denied');
    }

    await this.storageClient.hdel(
      `team:${teamId}:workspace:${workspaceId}:members`,
      memberId
    );
    await this.storageClient.srem(
      `team:${teamId}:member:${memberId}:workspaces`,
      workspaceId
    );

    await this.logAudit(teamId, 'workspace_permission_revoked', actorId, memberId, {
      workspaceId,
    });
  }

  /**
   * Get member's permission for a workspace
   */
  async getWorkspacePermission(
    teamId: string,
    memberId: string,
    workspaceId: string
  ): Promise<WorkspacePermission> {
    const member = await this.getMember(teamId, memberId);
    if (!member) {
      return 'none';
    }

    // Owners and admins have admin access to all workspaces
    if (member.role === 'owner' || member.role === 'admin') {
      return 'admin';
    }

    // Check explicit permission
    const permission = await this.storageClient.hget(
      `team:${teamId}:workspace:${workspaceId}:members`,
      memberId
    );

    return (permission as WorkspacePermission) || 'none';
  }

  /**
   * List member's workspace permissions
   */
  async listMemberWorkspaces(
    teamId: string,
    memberId: string
  ): Promise<Array<{ workspaceId: string; permission: WorkspacePermission }>> {
    const workspaceIds = await this.storageClient.smembers(
      `team:${teamId}:member:${memberId}:workspaces`
    );

    const result: Array<{ workspaceId: string; permission: WorkspacePermission }> = [];

    for (const wsId of workspaceIds) {
      const permission = await this.getWorkspacePermission(teamId, memberId, wsId);
      if (permission !== 'none') {
        result.push({ workspaceId: wsId, permission });
      }
    }

    return result;
  }

  // ============================================
  // Audit Logging
  // ============================================

  /**
   * Log a team audit entry
   */
  private async logAudit(
    teamId: string,
    action: TeamAuditAction,
    actorId: string,
    targetId?: string,
    details?: Record<string, unknown>
  ): Promise<void> {
    const entry: TeamAuditEntry = {
      id: ulid(),
      teamId,
      action,
      actorId,
      targetId,
      details,
      timestamp: Date.now(),
    };

    await this.storageClient.zadd(
      `team:${teamId}:audit`,
      entry.timestamp,
      entry.id
    );
    await this.storageClient.hset(
      `team:${teamId}:audit:${entry.id}`,
      this.serializeAuditEntry(entry)
    );
  }

  /**
   * Get team audit log
   */
  async getAuditLog(
    teamId: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<TeamAuditEntry[]> {
    const ids = await this.storageClient.zrange(
      `team:${teamId}:audit`,
      -(offset + limit),
      -(offset + 1)
    );

    const entries: TeamAuditEntry[] = [];
    for (const id of ids.reverse()) {
      const data = await this.storageClient.hgetall(`team:${teamId}:audit:${id}`);
      if (data && Object.keys(data).length > 0) {
        entries.push(this.deserializeAuditEntry(data));
      }
    }

    return entries;
  }

  // ============================================
  // Serialization Helpers
  // ============================================

  private serializeTeam(team: Team): Record<string, string> {
    return {
      id: team.id,
      name: team.name,
      ownerId: team.ownerId,
      plan: team.plan,
      createdAt: team.createdAt.toString(),
      updatedAt: team.updatedAt.toString(),
      settings: JSON.stringify(team.settings),
    };
  }

  private deserializeTeam(data: Record<string, string>): Team {
    return {
      id: data.id,
      name: data.name,
      ownerId: data.ownerId,
      plan: data.plan as Team['plan'],
      createdAt: parseInt(data.createdAt),
      updatedAt: parseInt(data.updatedAt),
      settings: JSON.parse(data.settings || JSON.stringify(DEFAULT_TEAM_SETTINGS)),
    };
  }

  private serializeMember(member: TeamMember): Record<string, string> {
    return {
      id: member.id,
      teamId: member.teamId,
      tenantId: member.tenantId,
      email: member.email,
      name: member.name || '',
      role: member.role,
      invitedBy: member.invitedBy,
      invitedAt: member.invitedAt.toString(),
      joinedAt: member.joinedAt?.toString() || '',
      status: member.status,
    };
  }

  private deserializeMember(data: Record<string, string>): TeamMember {
    return {
      id: data.id,
      teamId: data.teamId,
      tenantId: data.tenantId,
      email: data.email,
      name: data.name || undefined,
      role: data.role as TeamRole,
      invitedBy: data.invitedBy,
      invitedAt: parseInt(data.invitedAt),
      joinedAt: data.joinedAt ? parseInt(data.joinedAt) : undefined,
      status: data.status as TeamMember['status'],
    };
  }

  private serializeInvite(invite: TeamInvite): Record<string, string> {
    return {
      id: invite.id,
      teamId: invite.teamId,
      email: invite.email,
      role: invite.role,
      invitedBy: invite.invitedBy,
      createdAt: invite.createdAt.toString(),
      expiresAt: invite.expiresAt.toString(),
      token: invite.token,
      workspaceIds: invite.workspaceIds?.join(',') || '',
    };
  }

  private deserializeInvite(data: Record<string, string>): TeamInvite {
    return {
      id: data.id,
      teamId: data.teamId,
      email: data.email,
      role: data.role as TeamRole,
      invitedBy: data.invitedBy,
      createdAt: parseInt(data.createdAt),
      expiresAt: parseInt(data.expiresAt),
      token: data.token,
      workspaceIds: data.workspaceIds ? data.workspaceIds.split(',') : undefined,
    };
  }

  private serializeAuditEntry(entry: TeamAuditEntry): Record<string, string> {
    return {
      id: entry.id,
      teamId: entry.teamId,
      action: entry.action,
      actorId: entry.actorId,
      targetId: entry.targetId || '',
      details: entry.details ? JSON.stringify(entry.details) : '',
      timestamp: entry.timestamp.toString(),
    };
  }

  private deserializeAuditEntry(data: Record<string, string>): TeamAuditEntry {
    return {
      id: data.id,
      teamId: data.teamId,
      action: data.action as TeamAuditAction,
      actorId: data.actorId,
      targetId: data.targetId || undefined,
      details: data.details ? JSON.parse(data.details) : undefined,
      timestamp: parseInt(data.timestamp),
    };
  }

  private generateSecureToken(length: number): string {
    const chars =
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const bytes = randomBytes(length);
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars[bytes[i] % chars.length];
    }
    return result;
  }
}
