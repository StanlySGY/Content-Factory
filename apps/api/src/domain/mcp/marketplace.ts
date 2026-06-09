import { MCP_MARKETPLACE_INSTALLATION_STATUSES, type McpMarketplaceInstallationStatus } from "@cf/shared";
import { InvalidTransitionError, ValidationError } from "../errors.js";

export interface McpMarketplaceToolManifest {
  name: string;
  description?: string;
  [key: string]: unknown;
}

export interface McpMarketplaceManifest {
  server_ref: string;
  display_name: string;
  endpoint: string;
  tools: McpMarketplaceToolManifest[];
  [key: string]: unknown;
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function requireNonBlankString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0)
    throw new ValidationError(`${field} is required`);
  return value.trim();
}

export function validateMcpMarketplaceManifest(value: unknown): McpMarketplaceManifest {
  if (!isPlainObject(value)) throw new ValidationError("mcp_marketplace_entry.manifest must be an object");

  const serverRef = requireNonBlankString(value.server_ref, "manifest.server_ref");
  if (!serverRef.startsWith("mcp://")) throw new ValidationError("manifest.server_ref must start with mcp://");

  const displayName = requireNonBlankString(value.display_name, "manifest.display_name");
  const endpoint = requireNonBlankString(value.endpoint, "manifest.endpoint");
  try {
    const parsed = new URL(endpoint);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:")
      throw new ValidationError("manifest.endpoint must be an HTTP/HTTPS URL");
  } catch (error) {
    if (error instanceof ValidationError) throw error;
    throw new ValidationError("manifest.endpoint must be an HTTP/HTTPS URL");
  }

  if (!Array.isArray(value.tools) || value.tools.length === 0)
    throw new ValidationError("manifest.tools must be a non-empty array");

  const seen = new Set<string>();
  const tools = value.tools.map((tool, index) => {
    if (!isPlainObject(tool)) throw new ValidationError(`manifest.tools[${index}] must be an object`);
    const name = requireNonBlankString(tool.name, `manifest.tools[${index}].name`);
    if (seen.has(name)) throw new ValidationError(`manifest.tools name must be unique: ${name}`);
    seen.add(name);
    if (tool.description !== undefined && typeof tool.description !== "string")
      throw new ValidationError(`manifest.tools[${index}].description must be a string`);
    return { ...tool, name, ...(tool.description !== undefined ? { description: tool.description } : {}) };
  });

  return { ...value, server_ref: serverRef, display_name: displayName, endpoint, tools };
}

export function validateMcpMarketplaceInstallationStatus(status: unknown): McpMarketplaceInstallationStatus {
  if (typeof status !== "string" || !(MCP_MARKETPLACE_INSTALLATION_STATUSES as readonly string[]).includes(status))
    throw new ValidationError(`invalid mcp marketplace installation status: ${String(status)}`);
  return status as McpMarketplaceInstallationStatus;
}

export function assertMcpMarketplaceInstallationTransition(
  from: McpMarketplaceInstallationStatus,
  to: McpMarketplaceInstallationStatus,
): void {
  validateMcpMarketplaceInstallationStatus(from);
  validateMcpMarketplaceInstallationStatus(to);
  const allowed =
    (from === "installed" && (to === "disabled" || to === "uninstalled")) ||
    (from === "disabled" && to === "uninstalled") ||
    from === to;
  if (!allowed) throw new InvalidTransitionError(`invalid mcp marketplace installation transition: ${from} -> ${to}`);
}
