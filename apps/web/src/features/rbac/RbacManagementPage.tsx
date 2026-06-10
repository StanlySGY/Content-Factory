import { useEffect, useMemo, useState } from "react";
import type { OrganizationDTO, OrganizationMemberDTO, ProjectMembershipDTO } from "@cf/shared";
import { EmptyState, ErrorBar, Skeleton } from "../../components/states.js";
import { DEFAULT_PROJECT_ID } from "../../lib/config.js";
import {
  useRbacOrganizationMembers,
  useRbacOrganizations,
  useRbacProjectMemberships,
} from "./hooks.js";

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

function MemberTable({ members }: { members: OrganizationMemberDTO[] }) {
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
              <StatusBadge status={member.role} />
            </td>
            <td>
              <StatusBadge status={member.status} />
            </td>
            <td>
              <code>{shortId(member.invited_by)}</code>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ProjectMembershipTable({ memberships }: { memberships: ProjectMembershipDTO[] }) {
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
  const organizations = useMemo(() => organizationsQuery.data ?? [], [organizationsQuery.data]);
  const firstOrganization = organizations[0];
  const activeOrganizationId = selectedOrganizationId ?? firstOrganization?.id;
  const membersQuery = useRbacOrganizationMembers(activeOrganizationId);

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
          <p>只读组织、成员与默认项目授权库存</p>
        </div>
      </div>

      {organizationsQuery.isError && (
        <ErrorBar message={`组织列表加载失败：${(organizationsQuery.error as Error).message}`} />
      )}
      {membershipsQuery.isError && (
        <ErrorBar message={`项目 membership 加载失败：${(membershipsQuery.error as Error).message}`} />
      )}
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
                  <MemberTable members={membersQuery.data} />
                </>
              )}
              {!activeOrganizationId && !membersQuery.isLoading && (
                <EmptyState title="请选择组织" hint="选中 organization 后显示成员。" />
              )}

              <div className="rbac-section-head">
                <h2 className="section-title">Default project memberships</h2>
                <span>{DEFAULT_PROJECT_ID}</span>
              </div>
              <ProjectMembershipTable memberships={membershipsQuery.data} />
            </section>
          </div>
        </>
      )}
    </div>
  );
}
