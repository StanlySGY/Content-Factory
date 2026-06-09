import { PUBLISHER_CHANNEL_STATUSES, type PublisherChannelStatus } from "@cf/shared";
import { InvalidTransitionError, ValidationError } from "../errors.js";

const KEY_RE = /^[a-z0-9][a-z0-9_:-]*$/;

export interface CreatePublisherChannelInput {
  key: string;
  display_name: string;
  endpoint_ref?: string | null;
  config?: Record<string, unknown>;
}

function requireNonBlank(value: unknown, label: string, max: number): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new ValidationError(`${label} is required`);
  if (value.length > max) throw new ValidationError(`${label} is too long`);
  return value.trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function validatePublisherChannel(input: CreatePublisherChannelInput): void {
  const key = requireNonBlank(input.key, "publisher_channel.key", 64);
  if (!KEY_RE.test(key)) throw new ValidationError("publisher_channel.key is invalid");
  requireNonBlank(input.display_name, "publisher_channel.display_name", 160);
  if (input.endpoint_ref !== undefined && input.endpoint_ref !== null)
    requireNonBlank(input.endpoint_ref, "publisher_channel.endpoint_ref", 240);
  if (input.config !== undefined && !isRecord(input.config)) throw new ValidationError("publisher_channel.config must be an object");
}

export function validatePublisherChannelStatus(status: string): asserts status is PublisherChannelStatus {
  if (!(PUBLISHER_CHANNEL_STATUSES as readonly string[]).includes(status))
    throw new ValidationError(`invalid publisher channel status: ${status}`);
}

export function assertPublisherChannelTransition(from: PublisherChannelStatus, to: PublisherChannelStatus): void {
  validatePublisherChannelStatus(from);
  validatePublisherChannelStatus(to);
  const allowed: Record<PublisherChannelStatus, PublisherChannelStatus[]> = {
    active: ["disabled", "archived"],
    disabled: ["active", "archived"],
    archived: [],
  };
  if (from === to) return;
  if (!allowed[from].includes(to)) {
    throw new InvalidTransitionError(`invalid publisher channel status transition: ${from} -> ${to}`);
  }
}
