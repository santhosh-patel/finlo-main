import { useCallback, useEffect, useState } from "react";

const AUTH_KEY = "ledger.auth.v1";
const VALID_EMAIL = "santhoshpatel002@gmail.com";
const VALID_PASSWORD = "Chinni@2003";

export function useAuth() {
  const [isAuthed, setIsAuthed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(AUTH_KEY) === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      if (isAuthed) localStorage.setItem(AUTH_KEY, "1");
      else localStorage.removeItem(AUTH_KEY);
    } catch {
      // ignore
    }
  }, [isAuthed]);

  const login = useCallback((email: string, password: string): string | null => {
    if (email.trim().toLowerCase() !== VALID_EMAIL) return "Invalid email or password.";
    if (password !== VALID_PASSWORD) return "Invalid email or password.";
    setIsAuthed(true);
    return null;
  }, []);

  const logout = useCallback(() => setIsAuthed(false), []);

  return { isAuthed, login, logout };
}