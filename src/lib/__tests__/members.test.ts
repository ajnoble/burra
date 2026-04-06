import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock drizzle before importing the module under test
const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockWhere = vi.fn();
const mockLimit = vi.fn();
const mockOffset = vi.fn();
const mockOrderBy = vi.fn();
const mockInnerJoin = vi.fn();
const mockLeftJoin = vi.fn();

vi.mock("@/db/index", () => ({
  db: {
    select: (...args: unknown[]) => {
      mockSelect(...args);
      return {
        from: (...fArgs: unknown[]) => {
          mockFrom(...fArgs);
          return {
            leftJoin: (...ljArgs: unknown[]) => {
              mockLeftJoin(...ljArgs);
              return {
                where: (...wArgs: unknown[]) => {
                  mockWhere(...wArgs);
                  return {
                    orderBy: (...oArgs: unknown[]) => {
                      mockOrderBy(...oArgs);
                      return [];
                    },
                    limit: (...lArgs: unknown[]) => {
                      mockLimit(...lArgs);
                      return [];
                    },
                  };
                },
              };
            },
            innerJoin: (...jArgs: unknown[]) => {
              mockInnerJoin(...jArgs);
              return {
                leftJoin: (...ljArgs: unknown[]) => {
                  mockLeftJoin(...ljArgs);
                  return {
                    where: (...wArgs: unknown[]) => {
                      mockWhere(...wArgs);
                      return {
                        orderBy: (...oArgs: unknown[]) => {
                          mockOrderBy(...oArgs);
                          return {
                            limit: (...lArgs: unknown[]) => {
                              mockLimit(...lArgs);
                              return {
                                offset: (...offArgs: unknown[]) => {
                                  mockOffset(...offArgs);
                                  return [];
                                },
                              };
                            },
                          };
                        },
                        limit: (...lArgs: unknown[]) => {
                          mockLimit(...lArgs);
                          return [];
                        },
                      };
                    },
                    orderBy: (...oArgs: unknown[]) => {
                      mockOrderBy(...oArgs);
                      return {
                        limit: (...lArgs: unknown[]) => {
                          mockLimit(...lArgs);
                          return {
                            offset: (...offArgs: unknown[]) => {
                              mockOffset(...offArgs);
                              return [];
                            },
                          };
                        },
                      };
                    },
                  };
                },
                where: (...wArgs: unknown[]) => {
                  mockWhere(...wArgs);
                  return {
                    orderBy: (...oArgs: unknown[]) => {
                      mockOrderBy(...oArgs);
                      return {
                        limit: (...lArgs: unknown[]) => {
                          mockLimit(...lArgs);
                          return {
                            offset: (...offArgs: unknown[]) => {
                              mockOffset(...offArgs);
                              return [];
                            },
                          };
                        },
                      };
                    },
                    limit: (...lArgs: unknown[]) => {
                      mockLimit(...lArgs);
                      return [];
                    },
                  };
                },
              };
            },
            where: (...wArgs: unknown[]) => {
              mockWhere(...wArgs);
              return {
                orderBy: (...oArgs: unknown[]) => {
                  mockOrderBy(...oArgs);
                  return [];
                },
                limit: (...lArgs: unknown[]) => {
                  mockLimit(...lArgs);
                  return [];
                },
              };
            },
          };
        },
      };
    },
  },
}));

import {
  getMembers,
  getMemberById,
  getFamilyMembers,
  getFinancialHistory,
  searchMembers,
} from "../members";

const ORG_ID = "550e8400-e29b-41d4-a716-446655440000";
const MEMBER_ID = "660e8400-e29b-41d4-a716-446655440000";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getMembers", () => {
  it("calls db.select with default pagination", async () => {
    await getMembers(ORG_ID, {});
    expect(mockSelect).toHaveBeenCalled();
    expect(mockFrom).toHaveBeenCalled();
    expect(mockLimit).toHaveBeenCalledWith(25);
    expect(mockOffset).toHaveBeenCalledWith(0);
  });

  it("applies page offset correctly", async () => {
    await getMembers(ORG_ID, { page: 3 });
    expect(mockLimit).toHaveBeenCalledWith(25);
    expect(mockOffset).toHaveBeenCalledWith(50); // (3-1) * 25
  });
});

describe("getMemberById", () => {
  it("calls db.select and limits to 1", async () => {
    await getMemberById(ORG_ID, MEMBER_ID);
    expect(mockSelect).toHaveBeenCalled();
    expect(mockFrom).toHaveBeenCalled();
    expect(mockLimit).toHaveBeenCalledWith(1);
  });
});

describe("getFamilyMembers", () => {
  it("calls db.select", async () => {
    await getFamilyMembers(ORG_ID, MEMBER_ID);
    expect(mockSelect).toHaveBeenCalled();
    expect(mockFrom).toHaveBeenCalled();
    expect(mockWhere).toHaveBeenCalled();
  });
});

describe("getFinancialHistory", () => {
  it("calls db.select with ordering", async () => {
    await getFinancialHistory(ORG_ID, MEMBER_ID);
    expect(mockSelect).toHaveBeenCalled();
    expect(mockFrom).toHaveBeenCalled();
    expect(mockWhere).toHaveBeenCalled();
    expect(mockOrderBy).toHaveBeenCalled();
  });
});

describe("searchMembers", () => {
  it("calls db.select with limit of 10", async () => {
    await searchMembers(ORG_ID, "james");
    expect(mockSelect).toHaveBeenCalled();
    expect(mockFrom).toHaveBeenCalled();
    expect(mockLimit).toHaveBeenCalledWith(10);
  });
});
