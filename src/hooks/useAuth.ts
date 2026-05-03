import { useCallback, useEffect, useState } from "react";

const AUTH_KEY = "ledger.auth.v1";
const PROFILE_KEY = "ledger.profile.v1";
const DEFAULT_EMAIL = "santhoshpatel002@gmail.com";
const DEFAULT_PASSWORD = "Chinni@2003";
const DEFAULT_NAME = "Santhosh";

interface Profile { email: string; password: string; name: string; }

function readProfile(): Profile {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (raw) return { email: DEFAULT_EMAIL, password: DEFAULT_PASSWORD, name: DEFAULT_NAME, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { email: DEFAULT_EMAIL, password: DEFAULT_PASSWORD, name: DEFAULT_NAME };
}

export function useAuth() {
  const [isAuthed, setIsAuthed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(AUTH_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [profile, setProfile] = useState<Profile>(readProfile);

  useEffect(() => {
    try {
      if (isAuthed) localStorage.setItem(AUTH_KEY, "1");
      else localStorage.removeItem(AUTH_KEY);
    } catch {
      // ignore
    }
  }, [isAuthed]);

  const login = useCallback((email: string, password: string): string | null => {
    const p = readProfile();
    if (email.trim().toLowerCase() !== p.email.toLowerCase()) return "Invalid email or password.";
    if (password !== p.password) return "Invalid email or password.";
    setProfile(p);
    setIsAuthed(true);
    return null;
  }, []);

  const logout = useCallback(() => setIsAuthed(false), []);

  const updateProfile = useCallback(
    (patch: Partial<Profile> & { currentPassword?: string }): string | null => {
      const cur = readProfile();
      if (patch.password && patch.currentPassword !== cur.password) {
        return "Current password is incorrect.";
      }
      const next: Profile = {
        email: patch.email?.trim() || cur.email,
        password: patch.password || cur.password,
        name: patch.name?.trim() || cur.name,
      };
      try { localStorage.setItem(PROFILE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      setProfile(next);
      return null;
    },
    []
  );

  return { isAuthed, login, logout, profile, updateProfile };
}