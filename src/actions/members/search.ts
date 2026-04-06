"use server";

import { searchMembers as searchMembersQuery } from "@/lib/members";

export async function searchMembersAction(orgId: string, query: string) {
  return searchMembersQuery(orgId, query);
}
