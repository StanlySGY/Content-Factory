import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { OrganizationDTO, OrganizationMemberDTO, ProjectMembershipDTO } from "@cf/shared";
import { DEFAULT_PROJECT_ID } from "../src/lib/config";
import { App } from "../src/app/App";

const apiMock = vi.hoisted(() => ({
  listRbacOrganizations: vi.fn(),
  listRbacOrganizationMembers: vi.fn(),
  listRbacProjectMemberships: vi.fn(),
  createRbacOrganization: vi.fn(),
  addRbacOrganizationMember: vi.fn(),
  updateRbacOrganizationMember: vi.fn(),
  deactivateRbacOrganizationMember: vi.fn(),
  grantRbacProjectMembership: vi.fn(),
  revokeRbacProjectMembership: vi.fn(),
  checkRbacProjectAccess: vi.fn(),
}));

vi.mock("../src/lib/api", () => ({
  api: apiMock,
}));

const selectedOrganization: OrganizationDTO = {
  id: "00000000-0000-0000-0000-000000000801",
  name: "Content Ops",
  status: "active",
  created_by: "00000000-0000-0000-0000-000000000001",
  created_at: "2026-06-10T00:00:00.000Z",
  updated_at: "2026-06-10T00:10:00.000Z",
};

const archivedOrganization: OrganizationDTO = {
  id: "00000000-0000-0000-0000-000000000802",
  name: "Archive Team",
  status: "archived",
  created_by: "00000000-0000-0000-0000-000000000001",
  created_at: "2026-06-10T00:00:00.000Z",
  updated_at: "2026-06-10T00:20:00.000Z",
};

const organizationMembers: OrganizationMemberDTO[] = [
  {
    id: "00000000-0000-0000-0000-000000000901",
    organization_id: selectedOrganization.id,
    user_id: "00000000-0000-0000-0000-000000000001",
    role: "owner",
    status: "active",
    invited_by: "00000000-0000-0000-0000-000000000001",
    created_at: "2026-06-10T00:01:00.000Z",
    updated_at: "2026-06-10T00:11:00.000Z",
  },
  {
    id: "00000000-0000-0000-0000-000000000902",
    organization_id: selectedOrganization.id,
    user_id: "00000000-0000-0000-0000-000000000002",
    role: "viewer",
    status: "inactive",
    invited_by: "00000000-0000-0000-0000-000000000001",
    created_at: "2026-06-10T00:02:00.000Z",
    updated_at: "2026-06-10T00:12:00.000Z",
  },
];

const projectMemberships: ProjectMembershipDTO[] = [
  {
    id: "00000000-0000-0000-0000-000000001001",
    project_id: DEFAULT_PROJECT_ID,
    organization_member_id: organizationMembers[0]!.id,
    role: "owner",
    status: "active",
    granted_by: "00000000-0000-0000-0000-000000000001",
    created_at: "2026-06-10T00:03:00.000Z",
    updated_at: "2026-06-10T00:13:00.000Z",
  },
  {
    id: "00000000-0000-0000-0000-000000001002",
    project_id: DEFAULT_PROJECT_ID,
    organization_member_id: organizationMembers[1]!.id,
    role: "viewer",
    status: "revoked",
    granted_by: "00000000-0000-0000-0000-000000000001",
    created_at: "2026-06-10T00:04:00.000Z",
    updated_at: "2026-06-10T00:14:00.000Z",
  },
];

function renderRoute() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/rbac"]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("RbacManagementPage", () => {
  it("renders readonly organizations, members and project memberships without writes", async () => {
    apiMock.listRbacOrganizations.mockResolvedValue([selectedOrganization, archivedOrganization]);
    apiMock.listRbacOrganizationMembers.mockResolvedValue(organizationMembers);
    apiMock.listRbacProjectMemberships.mockResolvedValue(projectMemberships);

    renderRoute();

    expect(screen.getByRole("link", { name: "RBAC 管理" })).toHaveAttribute("href", "/rbac");
    expect(await screen.findByRole("heading", { name: "RBAC 管理" })).toBeInTheDocument();
    expect(await screen.findByText("Content Ops")).toBeInTheDocument();
    expect(apiMock.listRbacOrganizations).toHaveBeenCalledTimes(1);
    expect(apiMock.listRbacOrganizationMembers).toHaveBeenCalledWith(selectedOrganization.id);
    expect(apiMock.listRbacProjectMemberships).toHaveBeenCalledWith(DEFAULT_PROJECT_ID);

    expect(screen.getByText("Archive Team")).toBeInTheDocument();
    expect(screen.getByText("owner")).toBeInTheDocument();
    expect(screen.getByText("viewer")).toBeInTheDocument();
    expect(screen.getByText("inactive")).toBeInTheDocument();
    expect(screen.getByText("revoked")).toBeInTheDocument();
    expect(screen.getAllByText(DEFAULT_PROJECT_ID).length).toBeGreaterThan(0);

    expect(apiMock.createRbacOrganization).not.toHaveBeenCalled();
    expect(apiMock.addRbacOrganizationMember).not.toHaveBeenCalled();
    expect(apiMock.updateRbacOrganizationMember).not.toHaveBeenCalled();
    expect(apiMock.deactivateRbacOrganizationMember).not.toHaveBeenCalled();
    expect(apiMock.grantRbacProjectMembership).not.toHaveBeenCalled();
    expect(apiMock.revokeRbacProjectMembership).not.toHaveBeenCalled();
    expect(apiMock.checkRbacProjectAccess).not.toHaveBeenCalled();
  });
});
