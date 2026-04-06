import { describe, it, expect } from "vitest";
import { sortMembersWithFamilyFirst } from "../members-helpers";

describe("sortMembersWithFamilyFirst", () => {
  const currentMemberId = "member-1";

  it("puts the current member first", () => {
    const members = [
      { id: "member-2", firstName: "Alice", lastName: "B", primaryMemberId: null, membershipClassName: "Full" },
      { id: "member-1", firstName: "Bob", lastName: "A", primaryMemberId: null, membershipClassName: "Full" },
    ];

    const result = sortMembersWithFamilyFirst(members, currentMemberId);
    expect(result[0].id).toBe("member-1");
  });

  it("puts family members second (linked via primaryMemberId)", () => {
    const members = [
      { id: "member-3", firstName: "Charlie", lastName: "C", primaryMemberId: null, membershipClassName: "Full" },
      { id: "member-2", firstName: "Alice", lastName: "B", primaryMemberId: "member-1", membershipClassName: "Junior" },
      { id: "member-1", firstName: "Bob", lastName: "A", primaryMemberId: null, membershipClassName: "Full" },
    ];

    const result = sortMembersWithFamilyFirst(members, currentMemberId);
    expect(result[0].id).toBe("member-1"); // current member
    expect(result[1].id).toBe("member-2"); // family member
    expect(result[2].id).toBe("member-3"); // other member
  });

  it("puts dependents of current member in family group", () => {
    const members = [
      { id: "member-1", firstName: "Parent", lastName: "A", primaryMemberId: null, membershipClassName: "Full" },
      { id: "member-2", firstName: "Child1", lastName: "A", primaryMemberId: "member-1", membershipClassName: "Junior" },
      { id: "member-3", firstName: "Child2", lastName: "A", primaryMemberId: "member-1", membershipClassName: "Junior" },
      { id: "member-4", firstName: "Other", lastName: "B", primaryMemberId: null, membershipClassName: "Full" },
    ];

    const result = sortMembersWithFamilyFirst(members, currentMemberId);
    expect(result[0].id).toBe("member-1");
    expect(result[1].id).toBe("member-2");
    expect(result[2].id).toBe("member-3");
    expect(result[3].id).toBe("member-4");
  });

  it("includes members where current member is a dependent", () => {
    const primaryId = "member-0";
    const members = [
      { id: "member-1", firstName: "Child", lastName: "A", primaryMemberId: primaryId, membershipClassName: "Junior" },
      { id: "member-0", firstName: "Parent", lastName: "A", primaryMemberId: null, membershipClassName: "Full" },
      { id: "member-2", firstName: "Sibling", lastName: "A", primaryMemberId: primaryId, membershipClassName: "Junior" },
      { id: "member-3", firstName: "Other", lastName: "B", primaryMemberId: null, membershipClassName: "Full" },
    ];

    const result = sortMembersWithFamilyFirst(members, "member-1");
    expect(result[0].id).toBe("member-1"); // current member first
    // Family: parent and sibling
    const familyIds = result.slice(1, 3).map((m) => m.id).sort();
    expect(familyIds).toEqual(["member-0", "member-2"]);
    expect(result[3].id).toBe("member-3"); // other
  });

  it("handles empty list", () => {
    const result = sortMembersWithFamilyFirst([], currentMemberId);
    expect(result).toEqual([]);
  });
});
