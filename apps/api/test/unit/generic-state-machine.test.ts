import { describe, expect, it } from "vitest";
import { GenericStateMachine } from "../../src/domain/state-machine/generic-state-machine.js";
import { InvalidTransitionError } from "../../src/domain/errors.js";

type Light = "red" | "green" | "yellow";
const m = new GenericStateMachine<Light>("light", {
  red: ["green"],
  green: ["yellow"],
  yellow: ["red"],
});

describe("GenericStateMachine", () => {
  it("lists all declared states", () => {
    expect([...m.states()].sort()).toEqual(["green", "red", "yellow"]);
  });
  it("returns allowed successors", () => {
    expect(m.allowedFrom("red")).toEqual(["green"]);
  });
  it("returns empty set for unknown state", () => {
    expect(m.allowedFrom("blue" as Light)).toEqual([]);
  });
  it("canTransition true for declared edge", () => {
    expect(m.canTransition("red", "green")).toBe(true);
  });
  it("canTransition false for undeclared edge", () => {
    expect(m.canTransition("red", "yellow")).toBe(false);
  });
  it("canTransition false for self-transition unless declared", () => {
    expect(m.canTransition("red", "red")).toBe(false);
  });
  it("assertTransition passes for legal edge", () => {
    expect(() => m.assertTransition("green", "yellow")).not.toThrow();
  });
  it("assertTransition throws InvalidTransitionError with details", () => {
    try {
      m.assertTransition("red", "yellow");
      expect.unreachable("should throw");
    } catch (e) {
      expect(e).toBeInstanceOf(InvalidTransitionError);
      const err = e as InvalidTransitionError;
      expect(err.httpStatus).toBe(409);
      expect(err.details).toMatchObject({ entity: "light", from: "red", to: "yellow", allowed: ["green"] });
    }
  });
});
