import { useCallback, useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export interface Profile {
  user_id: string;
  email: string;
  name: string;
}

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile>({ user_id: "", email: "", name: "" });
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      setLoading(true);
      setSession(sess);
      setUser(sess?.user ?? null);
      if (!sess) {
        setProfile({ user_id: "", email: "", name: "" });
        setIsAdmin(false);
        setLoading(false);
      } else {
        // defer DB calls
        setTimeout(() => {
          loadProfileAndRole(sess.user.id, sess.user.email ?? "").finally(() => setLoading(false));
        }, 0);
      }
    });

    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      if (data.session) {
        await loadProfileAndRole(data.session.user.id, data.session.user.email ?? "");
      }
      setLoading(false);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const loadProfileAndRole = async (uid: string, email: string) => {
    const [{ data: prof }, { data: roleData }] = await Promise.all([
      supabase.from("profiles").select("display_name,email,user_id").eq("user_id", uid).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", uid),
    ]);
    setProfile({
      user_id: uid,
      email: prof?.email ?? email,
      name: prof?.display_name ?? email.split("@")[0],
    });
    setIsAdmin((roleData ?? []).some((r) => r.role === "admin"));
  };

  const login = useCallback(async (email: string, password: string): Promise<string | null> => {
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    if (error) return error.message;
    return null;
  }, []);

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const updateProfile = useCallback(
    async (patch: { name?: string; password?: string }): Promise<string | null> => {
      if (!user) return "Not signed in";
      if (patch.name && patch.name.trim()) {
        const { error } = await supabase
          .from("profiles")
          .update({ display_name: patch.name.trim() })
          .eq("user_id", user.id);
        if (error) return error.message;
        setProfile((p) => ({ ...p, name: patch.name!.trim() }));
      }
      if (patch.password) {
        const { error } = await supabase.auth.updateUser({ password: patch.password });
        if (error) return error.message;
      }
      return null;
    },
    [user]
  );

  return {
    isAuthed: !!session,
    loading,
    user,
    profile,
    isAdmin,
    login,
    logout,
    updateProfile,
  };
}
