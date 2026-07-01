import { describe, it, expect } from "vitest";
import { accessibleChildWhere, accessibleAlertWhere } from "./guard";

// These predicates are the authorization boundary for reading children and
// alerts, so their shape is worth pinning: access = owner OR co-guardian, and
// alert access flows THROUGH child access (never a bare parentId match, which
// would hide a co-guardian's alerts / leak nothing extra).

describe("accessibleChildWhere", () => {
  it("matches children owned OR co-guarded by the parent", () => {
    expect(accessibleChildWhere("p1")).toEqual({
      OR: [{ parentId: "p1" }, { guardianships: { some: { parentId: "p1" } } }],
    });
  });
});

describe("accessibleAlertWhere", () => {
  it("scopes alerts through the accessible-child predicate (not a bare parentId)", () => {
    expect(accessibleAlertWhere("p1")).toEqual({
      child: { OR: [{ parentId: "p1" }, { guardianships: { some: { parentId: "p1" } } }] },
    });
  });
});
