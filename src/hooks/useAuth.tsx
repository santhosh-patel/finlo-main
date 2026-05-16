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
  [x: string]: any;
  user_id: string;
  email: string;
  name: string;
  household_id?: string | null;
}

export interface AuthState {
  isAuthed: boolean;
  loading: boolean;
  user: User | null;
  profile: Profile;
  isAdmin: boolean;
  impersonatedUserId: string | null;
  impersonatedEmail: string | null;
  impersonatedName: string | null;
  impersonate: (id: string, email: string, name: string) => void;
  stopImpersonating: () => void;
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

  // Impersonation state
  const [impersonatedUserId, setImpersonatedUserId] = useState<string | null>(() => {
    return sessionStorage.getItem("finlo_impersonated_id");
  });
  const [impersonatedEmail, setImpersonatedEmail] = useState<string | null>(() => {
    return sessionStorage.getItem("finlo_impersonated_email");
  });
  const [impersonatedName, setImpersonatedName] = useState<string | null>(() => {
    return sessionStorage.getItem("finlo_impersonated_name");
  });

  const impersonate = useCallback((id: string, email: string, name: string) => {
    sessionStorage.setItem("finlo_impersonated_id", id);
    sessionStorage.setItem("finlo_impersonated_email", email);
    sessionStorage.setItem("finlo_impersonated_name", name);
    setImpersonatedUserId(id);
    setImpersonatedEmail(email);
    setImpersonatedName(name);
  }, []);

  const stopImpersonating = useCallback(() => {
    sessionStorage.removeItem("finlo_impersonated_id");
    sessionStorage.removeItem("finlo_impersonated_email");
    sessionStorage.removeItem("finlo_impersonated_name");
    setImpersonatedUserId(null);
    setImpersonatedEmail(null);
    setImpersonatedName(null);
  }, []);

  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    const loadProfileAndRole = async (uid: string, email: string) => {
      const [{ data: prof }, { data: roleData }] = await Promise.all([
        supabase.from("profiles").select("display_name,email,user_id,household_id").eq("user_id", uid).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", uid),
      ]);
      if (!mountedRef.current) return;
      setProfile({
        user_id: uid,
        email: prof?.email ?? email,
        name: prof?.display_name ?? email.split("@")[0],
        household_id: prof?.household_id,
      });
      setIsAdmin((roleData ?? []).some((r) => r.role === "admin"));
    };

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
        stopImpersonating(); // Reset impersonation on sign-out
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
          stopImpersonating();
        }
      })
      .catch(() => {
        if (mountedRef.current) {
          setSession(null);
          setUser(null);
          setProfile({ user_id: "", email: "", name: "" });
          setIsAdmin(false);
          stopImpersonating();
        }
      })
      .finally(() => {
        if (mountedRef.current) setLoading(false);
      });

    return () => {
      mountedRef.current = false;
      sub.subscription.unsubscribe();
    };
  }, [stopImpersonating]);

  const login = useCallback(async (email: string, password: string): Promise<string | null> => {
    const formattedEmail = email.trim().toLowerCase();
    const { error } = await supabase.auth.signInWithPassword({
      email: formattedEmail,
      password,
    });
    return error?.message ?? null;
  }, []);

  const logout = useCallback(async () => {
    stopImpersonating();
    await supabase.auth.signOut();
  }, [stopImpersonating]);

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
    impersonatedUserId,
    impersonatedEmail,
    impersonatedName,
    impersonate,
    stopImpersonating,
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
