"use client";

import { useEffect, useState } from "react";
import {
  Users,
  Plus,
  Mail,
  Shield,
  UserMinus,
  Crown,
  UserCog,
  Eye,
  Clock,
  X,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import {
  api,
  Team,
  TeamMember,
  TeamInvite,
  TeamRole,
} from "@/lib/api";

const ROLE_ICONS: Record<TeamRole, typeof Crown> = {
  owner: Crown,
  admin: Shield,
  member: UserCog,
  viewer: Eye,
};

const ROLE_LABELS: Record<TeamRole, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
  viewer: "Viewer",
};

const ROLE_COLORS: Record<TeamRole, string> = {
  owner: "text-yellow-500",
  admin: "text-purple-500",
  member: "text-blue-500",
  viewer: "text-gray-500",
};

export default function TeamPage() {
  const { apiKey, user } = useAuth();
  const [team, setTeam] = useState<Team | null>(null);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [invites, setInvites] = useState<TeamInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create team form
  const [teamName, setTeamName] = useState("");
  const [creating, setCreating] = useState(false);

  // Invite form
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<TeamRole>("member");
  const [inviting, setInviting] = useState(false);

  // Current user's role
  const [currentUserRole, setCurrentUserRole] = useState<TeamRole | null>(null);

  const loadTeamData = async () => {
    if (!apiKey) return;

    setLoading(true);
    setError(null);
    api.setApiKey(apiKey);

    const teamResponse = await api.getMyTeam();

    if (teamResponse.success && teamResponse.data) {
      setTeam(teamResponse.data);

      // Load members
      const membersResponse = await api.getTeamMembers(teamResponse.data.id);
      if (membersResponse.success && membersResponse.data) {
        setMembers(membersResponse.data);
        // Find current user's role
        const currentMember = membersResponse.data.find(
          (m) => m.tenantId === user?.uid
        );
        if (currentMember) {
          setCurrentUserRole(currentMember.role);
        }
      }

      // Load pending invites
      const invitesResponse = await api.getPendingInvites(teamResponse.data.id);
      if (invitesResponse.success && invitesResponse.data) {
        setInvites(invitesResponse.data);
      }
    } else if (teamResponse.error?.code === "NOT_FOUND") {
      // No team exists - show create form
      setTeam(null);
    } else if (teamResponse.error) {
      setError(teamResponse.error.message);
    }

    setLoading(false);
  };

  useEffect(() => {
    loadTeamData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey, user?.uid]);

  const handleCreateTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teamName.trim()) return;

    setCreating(true);
    const response = await api.createTeam(teamName.trim());

    if (response.success && response.data) {
      setTeam(response.data);
      setTeamName("");
      await loadTeamData();
    } else if (response.error) {
      setError(response.error.message);
    }
    setCreating(false);
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim() || !team) return;

    setInviting(true);
    const response = await api.inviteTeamMember(
      team.id,
      inviteEmail.trim(),
      inviteRole
    );

    if (response.success) {
      setShowInviteForm(false);
      setInviteEmail("");
      setInviteRole("member");
      await loadTeamData();
    } else if (response.error) {
      setError(response.error.message);
    }
    setInviting(false);
  };

  const handleCancelInvite = async (inviteId: string) => {
    if (!team) return;
    const response = await api.cancelInvite(team.id, inviteId);
    if (response.success) {
      await loadTeamData();
    } else if (response.error) {
      setError(response.error.message);
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    if (!team) return;
    if (!confirm("Are you sure you want to remove this member?")) return;

    const response = await api.removeMember(team.id, memberId);
    if (response.success) {
      await loadTeamData();
    } else if (response.error) {
      setError(response.error.message);
    }
  };

  const handleChangeRole = async (memberId: string, newRole: TeamRole) => {
    if (!team) return;

    const response = await api.updateMemberRole(team.id, memberId, newRole);
    if (response.success) {
      await loadTeamData();
    } else if (response.error) {
      setError(response.error.message);
    }
  };

  const canManageMembers =
    currentUserRole === "owner" || currentUserRole === "admin";
  const canChangeRoles =
    currentUserRole === "owner" || currentUserRole === "admin";
  const canRemoveMembers =
    currentUserRole === "owner" || currentUserRole === "admin";

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // No team - show create form
  if (!team) {
    return (
      <div className="max-w-2xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="w-6 h-6" />
              Create Your Team
            </CardTitle>
            <CardDescription>
              Teams allow you to collaborate with others. Create a team to
              invite members and share workspaces.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {error && (
              <div className="mb-4 p-3 bg-destructive/10 text-destructive rounded-lg text-sm">
                {error}
              </div>
            )}
            <form onSubmit={handleCreateTeam} className="space-y-4">
              <div>
                <label
                  htmlFor="teamName"
                  className="block text-sm font-medium mb-1"
                >
                  Team Name
                </label>
                <input
                  type="text"
                  id="teamName"
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  placeholder="My Awesome Team"
                  className="w-full px-3 py-2 border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                  required
                />
              </div>
              <Button type="submit" disabled={creating || !teamName.trim()}>
                {creating ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4 mr-2" />
                    Create Team
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{team.name}</h1>
          <p className="text-muted-foreground">
            {members.length} member{members.length !== 1 ? "s" : ""}
            {invites.length > 0 && ` + ${invites.length} pending`}
          </p>
        </div>
        {canManageMembers && (
          <Button onClick={() => setShowInviteForm(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Invite Member
          </Button>
        )}
      </div>

      {error && (
        <div className="p-3 bg-destructive/10 text-destructive rounded-lg text-sm">
          {error}
          <button
            onClick={() => setError(null)}
            className="ml-2 hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Invite Form Modal */}
      {showInviteForm && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Mail className="w-5 h-5" />
                Invite Team Member
              </span>
              <button
                onClick={() => setShowInviteForm(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="w-5 h-5" />
              </button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleInvite} className="space-y-4">
              <div>
                <label
                  htmlFor="email"
                  className="block text-sm font-medium mb-1"
                >
                  Email Address
                </label>
                <input
                  type="email"
                  id="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="colleague@company.com"
                  className="w-full px-3 py-2 border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                  required
                />
              </div>
              <div>
                <label
                  htmlFor="role"
                  className="block text-sm font-medium mb-1"
                >
                  Role
                </label>
                <select
                  id="role"
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as TeamRole)}
                  className="w-full px-3 py-2 border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  {currentUserRole === "owner" && (
                    <option value="admin">Admin - Can manage members</option>
                  )}
                  <option value="member">Member - Can write memories</option>
                  <option value="viewer">Viewer - Read-only access</option>
                </select>
              </div>
              <div className="flex gap-2">
                <Button type="submit" disabled={inviting || !inviteEmail.trim()}>
                  {inviting ? (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Mail className="w-4 h-4 mr-2" />
                      Send Invite
                    </>
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowInviteForm(false)}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Pending Invites */}
      {invites.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5" />
              Pending Invites
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {invites.map((invite) => (
                <div
                  key={invite.id}
                  className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <Mail className="w-5 h-5 text-muted-foreground" />
                    <div>
                      <p className="font-medium">{invite.email}</p>
                      <p className="text-sm text-muted-foreground">
                        Invited as {ROLE_LABELS[invite.role]} - expires{" "}
                        {new Date(invite.expiresAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  {canManageMembers && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleCancelInvite(invite.id)}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Team Members */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            Team Members
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {members.map((member) => {
              const RoleIcon = ROLE_ICONS[member.role];
              const isCurrentUser = member.tenantId === user?.uid;
              const canModifyThisMember =
                !isCurrentUser &&
                canChangeRoles &&
                (currentUserRole === "owner" ||
                  (currentUserRole === "admin" &&
                    member.role !== "owner" &&
                    member.role !== "admin"));

              return (
                <div
                  key={member.id}
                  className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <span className="text-lg font-medium text-primary">
                        {(member.name || member.email)[0].toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <p className="font-medium flex items-center gap-2">
                        {member.name || member.email}
                        {isCurrentUser && (
                          <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">
                            You
                          </span>
                        )}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {member.email}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div
                      className={`flex items-center gap-1 ${ROLE_COLORS[member.role]}`}
                    >
                      <RoleIcon className="w-4 h-4" />
                      <span className="text-sm font-medium">
                        {ROLE_LABELS[member.role]}
                      </span>
                    </div>

                    {canModifyThisMember && (
                      <div className="flex items-center gap-1">
                        <select
                          value={member.role}
                          onChange={(e) =>
                            handleChangeRole(
                              member.id,
                              e.target.value as TeamRole
                            )
                          }
                          className="text-sm border rounded px-2 py-1 bg-background"
                        >
                          {currentUserRole === "owner" && (
                            <option value="admin">Admin</option>
                          )}
                          <option value="member">Member</option>
                          <option value="viewer">Viewer</option>
                        </select>

                        {canRemoveMembers && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => handleRemoveMember(member.id)}
                          >
                            <UserMinus className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Team Settings */}
      {(currentUserRole === "owner" || currentUserRole === "admin") && (
        <Card>
          <CardHeader>
            <CardTitle>Team Settings</CardTitle>
            <CardDescription>
              Configure how your team works together
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Default Workspace Permission</p>
                  <p className="text-sm text-muted-foreground">
                    Permission level for new workspaces
                  </p>
                </div>
                <span className="text-sm bg-muted px-3 py-1 rounded">
                  {team.settings.defaultWorkspacePermission}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Allow Member Invites</p>
                  <p className="text-sm text-muted-foreground">
                    Whether admins can invite new members
                  </p>
                </div>
                <span className="text-sm bg-muted px-3 py-1 rounded">
                  {team.settings.allowMemberInvites ? "Yes" : "No"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Require Workspace Approval</p>
                  <p className="text-sm text-muted-foreground">
                    Require admin approval for new workspaces
                  </p>
                </div>
                <span className="text-sm bg-muted px-3 py-1 rounded">
                  {team.settings.requireApprovalForWorkspaces ? "Yes" : "No"}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
