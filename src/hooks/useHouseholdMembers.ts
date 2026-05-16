import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface HouseholdMember {
  user_id: string;
  name: string;
  email: string;
}

export function useHouseholdMembers(householdId: string | null | undefined) {
  const [membersById, setMembersById] = useState<Record<string, HouseholdMember>>({});

  useEffect(() => {
    if (!householdId) {
      setMembersById({});
      return;
    }

    let cancelled = false;

    const load = async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, display_name, email")
        .eq("household_id", householdId);

      if (cancelled) return;
      if (error) {
        console.error("Failed to load household members:", error);
        return;
      }

      const map: Record<string, HouseholdMember> = {};
      for (const row of data ?? []) {
        map[row.user_id] = {
          user_id: row.user_id,
          name: row.display_name?.trim() || row.email?.split("@")[0] || "Member",
          email: row.email ?? "",
        };
      }
      setMembersById(map);
    };

    void load();

    const channel = supabase
      .channel(`household_profiles_${householdId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "profiles",
          filter: `household_id=eq.${householdId}`,
        },
        () => {
          void load();
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [householdId]);

  return membersById;
}

export function memberInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (parts[0]?.slice(0, 2) ?? "?").toUpperCase();
}
