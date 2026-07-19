import { describe, expect, it } from "vitest";
import { fail, idle } from "@/lib/action-state";

describe("action state", () => {
  it("starts empty so nothing renders before the first submission", () => {
    expect(idle.error).toBeUndefined();
    expect(idle.fieldErrors).toBeUndefined();
    expect(idle.ok).toBeUndefined();
  });

  it("carries a summary message", () => {
    expect(fail("Something went wrong")).toEqual({ error: "Something went wrong" });
  });

  it("omits fieldErrors entirely rather than sending an empty object", () => {
    // Forms check `state.fieldErrors?.[name]`; an empty object would still be
    // truthy for any code that tests the container instead of the key.
    expect("fieldErrors" in fail("boom")).toBe(false);
  });

  it("carries per-field messages when given them", () => {
    const state = fail("Check the form", { email: "Already registered" });
    expect(state.error).toBe("Check the form");
    expect(state.fieldErrors?.["email"]).toBe("Already registered");
  });

  it("supports the indexed keys the entry form uses for line errors", () => {
    const state = fail("Fix the lines", {
      "accountId.0": "Choose an account",
      "amount.2": "Invalid amount",
    });
    expect(state.fieldErrors?.["accountId.0"]).toBe("Choose an account");
    expect(state.fieldErrors?.["amount.2"]).toBe("Invalid amount");
    expect(state.fieldErrors?.["amount.1"]).toBeUndefined();
  });

  it("never reports ok on a failure", () => {
    expect(fail("nope").ok).toBeUndefined();
  });
});
