import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export interface Profile {
  user_id: string;
  email: string;
  name: string;
}

export interface AuthState {
  isAuthed: boolean;
  loading: boolean;
  user: User | null;
  profile: Profile;
  isAdmin: boolean;
  login: (email: string, password: string) => Promise<string | null>;
  logout: () => Promise<void>;
  updateProfile: (patch: { name?: string; password?: string }) => Promise<string | null>;
}

const AuthContext = createContext<AuthState | null>(null);

function useProvideAuth(): AuthState {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile>({ user_id: "", email: "", name: "" });
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    const loadProfileAndRole = async (uid: string, email: string) => {
      const [{ data: prof }, { data: roleData }] = await Promise.all([
        supabase.from("profiles").select("display_name,email,user_id").eq("user_id", uid).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", uid),
      ]);
      if (!mountedRef.current) return;
      setProfile({
        user_id: uid,
        email: prof?.email ?? email,
        name: prof?.display_name ?? email.split("@")[0],
      });
      setIsAdmin((roleData ?? []).some((r) => r.role === "admin"));
    };

    // `loading` is ONLY for the first cold bootstrap (getSession). Never set it true from
    // onAuthStateChange — INITIAL_SESSION / SIGNED_IN / token refresh on resume would
    // unmount ProtectedRoute and wipe Index (tabs, Maya, sheets).
    const { data: sub } = supabase.auth.onAuthStateChange((event, sess) => {
      if (event === "TOKEN_REFRESHED" && sess) {
        setSession(sess);
        setUser(sess.user);
        return;
      }

      if (event === "USER_UPDATED" && sess) {
        setSession(sess);
        setUser(sess.user);
        void loadProfileAndRole(sess.user.id, sess.user.email ?? "");
        return;
      }

      setSession(sess);
      setUser(sess?.user ?? null);
      if (!sess) {
        setProfile({ user_id: "", email: "", name: "" });
        setIsAdmin(false);
        return;
      }

      void loadProfileAndRole(sess.user.id, sess.user.email ?? "");
    });

    supabase.auth
      .getSession()
      .then(async ({ data }) => {
        if (!mountedRef.current) return;
        setSession(data.session);
        setUser(data.session?.user ?? null);
        if (data.session) {
          await loadProfileAndRole(data.session.user.id, data.session.user.email ?? "");
        } else {
          setProfile({ user_id: "", email: "", name: "" });
          setIsAdmin(false);
        }
      })
      .catch(() => {
        if (mountedRef.current) {
          setSession(null);
          setUser(null);
          setProfile({ user_id: "", email: "", name: "" });
          setIsAdmin(false);
        }
      })
      .finally(() => {
        if (mountedRef.current) setLoading(false);
      });

    return () => {
      mountedRef.current = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<string | null> => {
    const formattedEmail = email.trim().toLowerCase();
    const { error } = await supabase.auth.signInWithPassword({
      email: formattedEmail,
      password,
    });
    return error?.message ?? null;
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
    [user],
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const value = useProvideAuth();
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
