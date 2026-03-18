import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  type User,
} from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";

import { auth, db } from "./firebase";
import type { UserProfile } from "./types";

interface AuthContextValue {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function normalizeProfile(uid: string, data: Record<string, unknown>): UserProfile {
  return {
    uid,
    email: String(data.email ?? ""),
    displayName: String(data.displayName ?? ""),
    role: data.role === "admin" ? "admin" : "sales",
    disabled: Boolean(data.disabled),
  };
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubProfile: (() => void) | undefined;
    const unsubAuth = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      if (unsubProfile) {
        unsubProfile();
        unsubProfile = undefined;
      }

      if (!nextUser) {
        setProfile(null);
        setLoading(false);
        return;
      }

      unsubProfile = onSnapshot(
        doc(db, "users", nextUser.uid),
        (snapshot) => {
          setProfile(snapshot.exists() ? normalizeProfile(nextUser.uid, snapshot.data()) : null);
          setLoading(false);
        },
        () => {
          setProfile(null);
          setLoading(false);
        },
      );
    });

    return () => {
      unsubAuth();
      if (unsubProfile) {
        unsubProfile();
      }
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      profile,
      loading,
      signIn: async (email, password) => {
        await signInWithEmailAndPassword(auth, email, password);
      },
      signOut: async () => {
        await firebaseSignOut(auth);
      },
    }),
    [loading, profile, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return context;
}
