import { useEffect, useMemo, useState } from "react";
import {
  ORGANIZATION_MEMBER_ROLES,
  PROJECT_MEMBER_ROLES,
  type OrganizationDTO,
  type OrganizationMemberDTO,
  type OrganizationMemberRole,
  type ProjectMemberRole,
  type ProjectMembershipDTO,
} from "@cf/shared";
import { EmptyState, ErrorBar, Skeleton } from "../../components/states.js";
import { DEFAULT_PROJECT_ID } from "../../lib/config.js";
import {
  useAddRbacOrganizationMember,
  useDeactivateRbacOrganizationMember,
  useGrantRbacProjectMembership,
  useRbacOrganizationMembers,
  useRbacOrganizations,
  useRbacProjectMemberships,
  useRevokeRbacProjectMembership,
  useUpdateRbacOrganizationMember,
} from "./hooks.js";

const organizationMemberRoles = ORGANIZATION_MEMBER_ROLES;
const projectMemberRoles = PROJECT_MEMBER_ROLES;

function statusTone(status: string) {
  if (status === "active") return "success";
  if (status === "inactive" || status === "revoked") return "running";
  if (status === "archived") return "neutral";
  return "info";
}

function StatusBadge({ status }: { status: string }) {
  return <span className={`badge ${statusTone(status)}`}>{status}</span>;
}

function shortId(id: string) {
  return id.slice(0, 8);
}

function Summary({
  organizations,
  members,
  memberships,
}: {
  organizations: OrganizationDTO[];
  members: OrganizationMemberDTO[];
  memberships: ProjectMembershipDTO[];
}) {
  const activeOrganizations = organizations.filter((org) => org.status === "active").length;
  const inactiveMembers = members.filter((member) => member.status === "inactive").length;
  const revokedMemberships = memberships.filter((membership) => membership.status === "revoked").length;

  return (
    <div className="kpi-grid rbac-kpi-grid">
      <div className="card kpi">
        <div className="kpi-value">{organizations.length}</div>
        <div className="kpi-label">Organizations</div>
      </div>
      <div className="card kpi">
        <div className="kpi-value">{activeOrganizations}</div>
        <div className="kpi-label">Active orgs</div>
      </div>
      <div className="card kpi">
        <div className="kpi-value">{members.length}</div>
        <div className="kpi-label">Selected members</div>
        {inactiveMembers > 0 && <div className="rbac-kpi-note">{inactiveMembers} inactive</div>}
      </div>
      <div className="card kpi">
        <div className="kpi-value">{memberships.length}</div>
        <div className="kpi-label">Project memberships</div>
        {revokedMemberships > 0 && <div className="rbac-kpi-note">{revokedMemberships} revoked</div>}
      </div>
    </div>
  );
}

function OrganizationTable({
  organizations,
  selectedOrganizationId,
  onSelect,
}: {
  organizations: OrganizationDTO[];
  selectedOrganizationId: string | undefined;
  onSelect: (organizationId: string) => void;
}) {
  if (organizations.length === 0) {
    return <EmptyState title="还没有组织" hint="Organization 创建后会出现在这里。" />;
  }

  return (
    <table className="table rbac-table">
      <thead>
        <tr>
          <th>Organization</th>
          <th>Status</th>
          <th>Created by</th>
          <th>Updated</th>
        </tr>
      </thead>
      <tbody>
        {organizations.map((organization) => (
          <tr
            className={organization.id === selectedOrganizationId ? "selected" : ""}
            key={organization.id}
          >
            <td>
              <button
                className="rbac-organization-button"
                onClick={() => onSelect(organization.id)}
                type="button"
              >
                {organization.name}
              </button>
              <span>{organization.id}</span>
            </td>
            <td>
              <StatusBadge status={organization.status} />
            </td>
            <td>
              <code>{shortId(organization.created_by)}</code>
            </td>
            <td>{new Date(organization.updated_at).toLocaleString()}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function MemberForm({
  onAdd,
  pending,
}: {
  onAdd: (input: { userId: string; role: OrganizationMemberRole }) => void;
  pending: boolean;
}) {
  const [userId, setUserId] = useState("");
  const [role, setRole] = useState<OrganizationMemberRole>("member");

  return (
    <form
      className="rbac-member-form"
      onSubmit={(event) => {
        event.preventDefault();
        onAdd({ userId, role });
        setUserId("");
        setRole("member");
      }}
    >
      <div className="field">
        <label htmlFor="rbac-member-user-id">User ID</label>
        <input
          id="rbac-member-user-id"
          value={userId}
          onChange={(event) => setUserId(event.target.value)}
          required
          placeholder="00000000-0000-0000-0000-000000000001"
        />
      </div>
      <div className="field">
        <label htmlFor="rbac-member-role">Organization role</label>
        <select
          id="rbac-member-role"
          value={role}
          onChange={(event) => setRole(event.target.value as OrganizationMemberRole)}
        >
          {organizationMemberRoles.map((roleOption) => (
            <option key={roleOption} value={roleOption}>
              {roleOption}
            </option>
          ))}
        </select>
      </div>
      <div className="rbac-form-actions">
        <button className="btn primary" disabled={pending} type="submit">
          添加成员
        </button>
      </div>
    </form>
  );
}

function MemberTable({
  members,
  onUpdateRole,
  onDeactivate,
  actionPending,
}: {
  members: OrganizationMemberDTO[];
  onUpdateRole: (memberId: string, role: OrganizationMemberRole) => void;
  onDeactivate: (memberId: string) => void;
  actionPending: boolean;
}) {
  if (members.length === 0) {
    return <EmptyState title="还没有组织成员" hint="选中组织下尚未登记 member。" />;
  }

  return (
    <table className="table rbac-table rbac-member-table">
      <thead>
        <tr>
          <th>User</th>
          <th>Role</th>
          <th>Status</th>
          <th>Invited by</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        {members.map((member) => (
          <tr key={member.id}>
            <td>
              <strong>{shortId(member.user_id)}</strong>
              <span>{member.id}</span>
            </td>
            <td>
              <select
                aria-label={`Role for ${member.id}`}
                className="rbac-inline-select"
                disabled={actionPending || member.status !== "active"}
                value={member.role}
                onChange={(event) => onUpdateRole(member.id, event.target.value as OrganizationMemberRole)}
              >
                {organizationMemberRoles.map((roleOption) => (
                  <option key={roleOption} value={roleOption}>
                    {roleOption}
                  </option>
                ))}
              </select>
            </td>
            <td>
              <StatusBadge status={member.status} />
            </td>
            <td>
              <code>{shortId(member.invited_by)}</code>
            </td>
            <td>
              {member.status === "active" && (
                <button
                  aria-label={`停用 ${member.id}`}
                  className="btn danger"
                  disabled={actionPending}
                  type="button"
                  onClick={() => onDeactivate(member.id)}
                >
                  停用
                </button>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ProjectMembershipForm({
  members,
  onGrant,
  pending,
}: {
  members: OrganizationMemberDTO[];
  onGrant: (input: { organizationMemberId: string; role: ProjectMemberRole }) => void;
  pending: boolean;
}) {
  const activeMembers = members.filter((member) => member.status === "active");
  const firstMemberId = activeMembers[0]?.id ?? "";
  const [organizationMemberId, setOrganizationMemberId] = useState(firstMemberId);
  const [role, setRole] = useState<ProjectMemberRole>("editor");

  useEffect(() => {
    if (!activeMembers.some((member) => member.id === organizationMemberId)) {
      setOrganizationMemberId(firstMemberId);
    }
  }, [activeMembers, firstMemberId, organizationMemberId]);

  return (
    <form
      className="rbac-project-grant-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (!organizationMemberId) return;
        onGrant({ organizationMemberId, role });
        setRole("editor");
      }}
    >
      <div className="field">
        <label htmlFor="rbac-project-member-id">Member for project grant</label>
        <select
          id="rbac-project-member-id"
          disabled={activeMembers.length === 0}
          value={organizationMemberId}
          onChange={(event) => setOrganizationMemberId(event.target.value)}
        >
          {activeMembers.map((member) => (
            <option key={member.id} value={member.id}>
              {member.id}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="rbac-project-role">Project role</label>
        <select
          id="rbac-project-role"
          value={role}
          onChange={(event) => setRole(event.target.value as ProjectMemberRole)}
        >
          {projectMemberRoles.map((roleOption) => (
            <option key={roleOption} value={roleOption}>
              {roleOption}
            </option>
          ))}
        </select>
      </div>
      <div className="rbac-form-actions">
        <button className="btn primary" disabled={pending || activeMembers.length === 0} type="submit">
          授权项目
        </button>
      </div>
    </form>
  );
}

function ProjectMembershipTable({
  memberships,
  onRevoke,
  actionPending,
}: {
  memberships: ProjectMembershipDTO[];
  onRevoke: (membershipId: string) => void;
  actionPending: boolean;
}) {
  if (memberships.length === 0) {
    return <EmptyState title="还没有项目 membership" hint="默认项目下尚未授权成员。" />;
  }

  return (
    <table className="table rbac-table rbac-project-table">
      <thead>
        <tr>
          <th>Project</th>
          <th>Organization member</th>
          <th>Project role</th>
          <th>Status</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        {memberships.map((membership) => (
          <tr key={membership.id}>
            <td>
              <code>{membership.project_id}</code>
            </td>
            <td>
              <strong>{shortId(membership.organization_member_id)}</strong>
              <span>{membership.id}</span>
            </td>
            <td>project {membership.role}</td>
            <td>
              <StatusBadge status={membership.status} />
            </td>
            <td>
              {membership.status === "active" && (
                <button
                  aria-label={`撤销 ${membership.id}`}
                  className="btn danger"
                  disabled={actionPending}
                  type="button"
                  onClick={() => onRevoke(membership.id)}
                >
                  撤销
                </button>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function RbacManagementPage() {
  const [selectedOrganizationId, setSelectedOrganizationId] = useState<string>();
  const organizationsQuery = useRbacOrganizations();
  const membershipsQuery = useRbacProjectMemberships(DEFAULT_PROJECT_ID);
  const addMember = useAddRbacOrganizationMember();
  const updateMember = useUpdateRbacOrganizationMember();
  const deactivateMember = useDeactivateRbacOrganizationMember();
  const grantMembership = useGrantRbacProjectMembership();
  const revokeMembership = useRevokeRbacProjectMembership();
  const organizations = useMemo(() => organizationsQuery.data ?? [], [organizationsQuery.data]);
  const firstOrganization = organizations[0];
  const activeOrganizationId = selectedOrganizationId ?? firstOrganization?.id;
  const membersQuery = useRbacOrganizationMembers(activeOrganizationId);
  const actionPending =
    addMember.isPending ||
    updateMember.isPending ||
    deactivateMember.isPending ||
    grantMembership.isPending ||
    revokeMembership.isPending;
  const mutationError =
    addMember.error || updateMember.error || deactivateMember.error || grantMembership.error || revokeMembership.error;

  useEffect(() => {
    if (organizations.length === 0) {
      setSelectedOrganizationId(undefined);
      return;
    }

    if (
      firstOrganization &&
      (!selectedOrganizationId ||
        !organizations.some((organization) => organization.id === selectedOrganizationId))
    ) {
      setSelectedOrganizationId(firstOrganization.id);
    }
  }, [firstOrganization, organizations, selectedOrganizationId]);

  return (
    <div className="rbac-management">
      <div className="page-head">
        <div>
          <h1>RBAC 管理</h1>
          <p>组织、成员角色与默认项目授权管理</p>
        </div>
      </div>

      {organizationsQuery.isError && (
        <ErrorBar message={`组织列表加载失败：${(organizationsQuery.error as Error).message}`} />
      )}
      {membershipsQuery.isError && (
        <ErrorBar message={`项目 membership 加载失败：${(membershipsQuery.error as Error).message}`} />
      )}
      {mutationError && <ErrorBar message={`RBAC 操作失败：${(mutationError as Error).message}`} />}
      {(organizationsQuery.isLoading || membershipsQuery.isLoading) && <Skeleton rows={5} />}

      {organizationsQuery.data && membershipsQuery.data && (
        <>
          <Summary
            organizations={organizations}
            members={membersQuery.data ?? []}
            memberships={membershipsQuery.data}
          />

          <div className="rbac-grid">
            <section>
              <div className="rbac-section-head">
                <h2 className="section-title">Organizations</h2>
                <span>{organizations.length} total</span>
              </div>
              <OrganizationTable
                onSelect={setSelectedOrganizationId}
                organizations={organizations}
                selectedOrganizationId={activeOrganizationId}
              />
            </section>

            <section className="rbac-detail-column">
              {membersQuery.isError && (
                <ErrorBar message={`组织成员加载失败：${(membersQuery.error as Error).message}`} />
              )}
              {activeOrganizationId && membersQuery.isLoading && <Skeleton rows={4} />}
              {membersQuery.data && (
                <>
                  <div className="rbac-section-head">
                    <h2 className="section-title">Organization members</h2>
                    <span>{membersQuery.data.length} total</span>
                  </div>
                  {activeOrganizationId && (
                    <MemberForm
                      pending={actionPending}
                      onAdd={({ userId, role }) =>
                        addMember.mutate({
                          organizationId: activeOrganizationId,
                          body: { user_id: userId.trim(), role },
                        })
                      }
                    />
                  )}
                  <MemberTable
                    actionPending={actionPending}
                    members={membersQuery.data}
                    onDeactivate={(memberId) => deactivateMember.mutate(memberId)}
                    onUpdateRole={(memberId, role) =>
                      updateMember.mutate({ id: memberId, body: { role } })
                    }
                  />
                </>
              )}
              {!activeOrganizationId && !membersQuery.isLoading && (
                <EmptyState title="请选择组织" hint="选中 organization 后显示成员。" />
              )}

              <div className="rbac-section-head">
                <h2 className="section-title">Default project memberships</h2>
                <span>{DEFAULT_PROJECT_ID}</span>
              </div>
              <ProjectMembershipForm
                members={membersQuery.data ?? []}
                pending={actionPending}
                onGrant={({ organizationMemberId, role }) =>
                  grantMembership.mutate({
                    projectId: DEFAULT_PROJECT_ID,
                    body: { organization_member_id: organizationMemberId, role },
                  })
                }
              />
              <ProjectMembershipTable
                actionPending={actionPending}
                memberships={membershipsQuery.data}
                onRevoke={(membershipId) => revokeMembership.mutate(membershipId)}
              />
            </section>
          </div>
        </>
      )}
    </div>
  );
}
