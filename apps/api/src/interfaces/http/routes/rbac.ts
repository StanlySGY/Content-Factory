import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import {
  AddOrganizationMemberSchema,
  CreateOrganizationSchema,
  GrantProjectMembershipSchema,
  IdParamSchema,
  OrganizationMemberResponseSchema,
  OrganizationMembersResponseSchema,
  OrganizationResponseSchema,
  ProjectMembershipResponseSchema,
  RbacProjectAccessQuerySchema,
  RbacProjectAccessResponseSchema,
  UpdateOrganizationMemberSchema,
} from "@cf/shared";
import type { RbacService } from "../../../application/rbac.service.js";
import {
  toOrganizationDTO,
  toOrganizationMemberDTO,
  toProjectMembershipDTO,
} from "../../../application/mappers.js";
import type { Env } from "../../../config/env.js";
import { buildContext } from "../context.js";

export interface RbacRoutesOptions {
  env: Env;
  rbacService: RbacService;
}

export const rbacRoutes: FastifyPluginAsyncTypebox<RbacRoutesOptions> = async (
  app,
  { env, rbacService },
) => {
  app.post(
    "/api/rbac/organizations",
    { schema: { body: CreateOrganizationSchema, response: { 201: OrganizationResponseSchema } } },
    async (request, reply) => {
      const org = await rbacService.createOrganization(buildContext(env, request), request.body);
      reply.code(201);
      return toOrganizationDTO(org);
    },
  );

  app.get(
    "/api/rbac/organizations/:id/members",
    { schema: { params: IdParamSchema, response: { 200: OrganizationMembersResponseSchema } } },
    async (request) =>
      (await rbacService.listOrganizationMembers(request.params.id)).map(toOrganizationMemberDTO),
  );

  app.post(
    "/api/rbac/organizations/:id/members",
    {
      schema: {
        params: IdParamSchema,
        body: AddOrganizationMemberSchema,
        response: { 201: OrganizationMemberResponseSchema },
      },
    },
    async (request, reply) => {
      const member = await rbacService.addOrganizationMember(
        buildContext(env, request),
        request.params.id,
        request.body,
      );
      reply.code(201);
      return toOrganizationMemberDTO(member);
    },
  );

  app.patch(
    "/api/rbac/organization-members/:id",
    {
      schema: {
        params: IdParamSchema,
        body: UpdateOrganizationMemberSchema,
        response: { 200: OrganizationMemberResponseSchema },
      },
    },
    async (request) =>
      toOrganizationMemberDTO(await rbacService.updateOrganizationMember(request.params.id, request.body)),
  );

  app.post(
    "/api/rbac/organization-members/:id/deactivate",
    { schema: { params: IdParamSchema, response: { 200: OrganizationMemberResponseSchema } } },
    async (request) =>
      toOrganizationMemberDTO(await rbacService.deactivateOrganizationMember(request.params.id)),
  );

  app.post(
    "/api/rbac/projects/:id/memberships",
    {
      schema: {
        params: IdParamSchema,
        body: GrantProjectMembershipSchema,
        response: { 201: ProjectMembershipResponseSchema },
      },
    },
    async (request, reply) => {
      const membership = await rbacService.grantProjectMembership(
        buildContext(env, request),
        request.params.id,
        request.body,
      );
      reply.code(201);
      return toProjectMembershipDTO(membership);
    },
  );

  app.post(
    "/api/rbac/project-memberships/:id/revoke",
    { schema: { params: IdParamSchema, response: { 200: ProjectMembershipResponseSchema } } },
    async (request) =>
      toProjectMembershipDTO(await rbacService.revokeProjectMembership(request.params.id)),
  );

  app.get(
    "/api/rbac/projects/:id/check-access",
    {
      schema: {
        params: IdParamSchema,
        querystring: RbacProjectAccessQuerySchema,
        response: { 200: RbacProjectAccessResponseSchema },
      },
    },
    async (request) =>
      rbacService.checkProjectAccess(buildContext(env, request), request.params.id, request.query),
  );
};
