"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase/config";
import { isAllowedDomain } from "@/lib/firebase/auth";
import { isAdmin as checkAdmin } from "@/lib/firebase/firestore";

type AuthState = {
  user: User | null;
  loading: boolean;
  isAdmin: boolean;
  adminLoading: boolean;
};

const AuthContext = createContext<AuthState>({
  user: null,
  loading: true,
  isAdmin: false,
  adminLoading: true,
});

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [admin, setAdmin] = useState(false);
  const [adminLoading, setAdminLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(getFirebaseAuth(), (u) => {
      if (u && isAllowedDomain(u.email)) {
        setUser(u);
      } else {
        setUser(null);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!user?.email) {
      setAdmin(false);
      setAdminLoading(false);
      return;
    }
    setAdminLoading(true);
    checkAdmin(user.email)
      .then(setAdmin)
      .catch(() => setAdmin(false))
      .finally(() => setAdminLoading(false));
  }, [user?.email]);

  return (
    <AuthContext.Provider
      value={{ user, loading, isAdmin: admin, adminLoading }}
    >
      {children}
    </AuthContext.Provider>
  );
}
