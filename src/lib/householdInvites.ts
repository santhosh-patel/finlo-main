import { supabase } from "@/integrations/supabase/client";

export type IncomingHouseholdInvite = {
  id: string;
  household_id: string;
  email: string;
  inviter_id: string;
  created_at: string;
  inviter_name: string;
  household_name: string;
};

export async function fetchIncomingHouseholdInvites(): Promise<IncomingHouseholdInvite[]> {
  const { data: rows, error } = await supabase
    .from("household_invites")
    .select("id, household_id, email, inviter_id, created_at")
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("fetchIncomingHouseholdInvites", error);
    return [];
  }
  if (!rows?.length) return [];

  const inviterIds = [...new Set(rows.map((r) => r.inviter_id))];
  const householdIds = [...new Set(rows.map((r) => r.household_id))];

  const [{ data: inviters }, { data: households }] = await Promise.all([
    supabase.from("profiles").select("user_id, display_name, email").in("user_id", inviterIds),
    supabase.from("households").select("id, name").in("id", householdIds),
  ]);

  return rows.map((row) => {
    const inviter = inviters?.find((p) => p.user_id === row.inviter_id);
    const inviterName =
      inviter?.display_name?.trim() || inviter?.email?.split("@")[0] || "A partner";
    const householdName =
      households?.find((h) => h.id === row.household_id)?.name?.trim() || "Shared Space";

    return {
      ...row,
      inviter_name: inviterName,
      household_name: householdName,
    };
  });
}

export async function notifyHouseholdInviteDelivered(inviteId: string) {
  try {
    await supabase.functions.invoke("notify-household-invite", {
      body: { invite_id: inviteId },
    });
  } catch (e) {
    console.warn("notify-household-invite", e);
  }
}
