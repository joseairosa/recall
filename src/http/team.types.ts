/**
 * Team Types
 *
 * Type definitions for team management in Recall SaaS.
 * Enables multi-user collaboration with role-based access control.
 */

/**
 * Team roles with increasing privileges
 */
export type TeamRole = 'owner' | 'admin' | 'member' | 'viewer';

/**
 * Workspace access permission levels
 */
export type WorkspacePermission = 'none' | 'read' | 'write' | 'admin';

/**
 * Team record stored in Redis
 */
export interface Team {
  id: string; // ULID
  name: string;
  ownerId: string; // Firebase UID of team owner
  plan: 'free' | 'pro' | 'team' | 'enterprise';
  createdAt: number;
  updatedAt: number;
  settings: TeamSettings;
}

/**
 * Team configuration settings
 */
export interface TeamSettings {
  allowMemberInvites: boolean; // Can admins invite members?
  defaultWorkspacePermission: WorkspacePermission; // Default permission for new workspaces
  requireApprovalForWorkspaces: boolean; // Require admin approval for new workspaces?
}

/**
 * Default team settings
 */
export const DEFAULT_TEAM_SETTINGS: TeamSettings = {
  allowMemberInvites: true,
  defaultWorkspacePermission: 'read',
  requireApprovalForWorkspaces: false,
};

/**
 * Team member record stored in Redis
 */
export interface TeamMember {
  id: string; // ULID
  teamId: string;
  tenantId: string; // Firebase UID
  email: string;
  name?: string;
  role: TeamRole;
  invitedBy: string; // tenantId who invited
  invitedAt: number;
  joinedAt?: number;
  status: 'pending' | 'active' | 'suspended';
}

/**
 * Workspace permission for a team member
 */
export interface TeamMemberWorkspacePermission {
  memberId: string;
  workspaceId: string;
  permission: WorkspacePermission;
  grantedBy: string; // tenantId who granted
  grantedAt: number;
}

/**
 * Pending team invitation
 */
export interface TeamInvite {
  id: string; // ULID
  teamId: string;
  email: string;
  role: TeamRole;
  invitedBy: string; // tenantId who invited
  createdAt: number;
  expiresAt: number;
  token: string; // Secure random token for invite link
  workspaceIds?: string[]; // Pre-assigned workspaces
}

/**
 * Team audit log entry
 */
export interface TeamAuditEntry {
  id: string; // ULID
  teamId: string;
  action: TeamAuditAction;
  actorId: string; // Who performed the action
  targetId?: string; // Member/workspace affected
  details?: Record<string, unknown>;
  timestamp: number;
}

/**
 * Types of team audit actions
 */
export type TeamAuditAction =
  | 'team_created'
  | 'team_updated'
  | 'team_deleted'
  | 'member_invited'
  | 'member_joined'
  | 'member_removed'
  | 'member_role_changed'
  | 'member_suspended'
  | 'workspace_permission_granted'
  | 'workspace_permission_revoked'
  | 'api_key_created'
  | 'api_key_revoked';

/**
 * Role-based permissions matrix
 */
export const ROLE_PERMISSIONS: Record<
  TeamRole,
  {
    canInviteMembers: boolean;
    canRemoveMembers: boolean;
    canChangeRoles: boolean;
    canManageWorkspacePermissions: boolean;
    canDeleteTeam: boolean;
    canManageBilling: boolean;
    canCreateApiKeys: boolean;
    canAccessAllWorkspaces: boolean;
  }
> = {
  owner: {
    canInviteMembers: true,
    canRemoveMembers: true,
    canChangeRoles: true,
    canManageWorkspacePermissions: true,
    canDeleteTeam: true,
    canManageBilling: true,
    canCreateApiKeys: true,
    canAccessAllWorkspaces: true,
  },
  admin: {
    canInviteMembers: true,
    canRemoveMembers: true,
    canChangeRoles: true, // Except owner
    canManageWorkspacePermissions: true,
    canDeleteTeam: false,
    canManageBilling: false,
    canCreateApiKeys: true,
    canAccessAllWorkspaces: true,
  },
  member: {
    canInviteMembers: false,
    canRemoveMembers: false,
    canChangeRoles: false,
    canManageWorkspacePermissions: false,
    canDeleteTeam: false,
    canManageBilling: false,
    canCreateApiKeys: true, // Own keys only
    canAccessAllWorkspaces: false,
  },
  viewer: {
    canInviteMembers: false,
    canRemoveMembers: false,
    canChangeRoles: false,
    canManageWorkspacePermissions: false,
    canDeleteTeam: false,
    canManageBilling: false,
    canCreateApiKeys: true, // Own keys only
    canAccessAllWorkspaces: false,
  },
};

/**
 * Check if a role has a specific permission
 */
export function hasPermission(
  role: TeamRole,
  permission: keyof (typeof ROLE_PERMISSIONS)[TeamRole]
): boolean {
  return ROLE_PERMISSIONS[role][permission];
}

/**
 * Check if a role can modify another role
 */
export function canModifyRole(actorRole: TeamRole, targetRole: TeamRole): boolean {
  // Owner can modify anyone
  if (actorRole === 'owner') return true;

  // Admin can modify member and viewer
  if (actorRole === 'admin') {
    return targetRole === 'member' || targetRole === 'viewer';
  }

  // Members and viewers cannot modify roles
  return false;
}

/**
 * Get the role hierarchy level (higher = more privileges)
 */
export function getRoleLevel(role: TeamRole): number {
  const levels: Record<TeamRole, number> = {
    viewer: 1,
    member: 2,
    admin: 3,
    owner: 4,
  };
  return levels[role];
}

/**
 * Check if user can write to a workspace based on permission
 */
export function canWriteToWorkspace(permission: WorkspacePermission): boolean {
  return permission === 'write' || permission === 'admin';
}

/**
 * Check if user can manage a workspace based on permission
 */
export function canManageWorkspace(permission: WorkspacePermission): boolean {
  return permission === 'admin';
}
