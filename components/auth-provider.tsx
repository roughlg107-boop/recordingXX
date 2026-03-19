"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren
} from "react";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut as firebaseSignOut, type User } from "firebase/auth";

import { firebaseAuth } from "@/lib/firebase-client";

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function toSignInErrorMessage(error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    switch (error.code) {
      case "auth/invalid-credential":
      case "auth/user-not-found":
      case "auth/wrong-password":
        return "帳號或密碼錯誤。";
      case "auth/invalid-email":
        return "Email 格式不正確。";
      case "auth/too-many-requests":
        return "登入嘗試過多，請稍後再試。";
      default:
        break;
    }
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "登入失敗。";
}

async function syncServerSession(user: User) {
  const idToken = await user.getIdToken(true);
  const response = await fetch("/api/auth/session", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ idToken })
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({ message: "無法建立登入工作階段。" }))) as {
      message?: string;
    };
    throw new Error(payload.message || "無法建立登入工作階段。");
  }
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const unsubscribe = onAuthStateChanged(firebaseAuth, async (nextUser) => {
      if (cancelled) {
        return;
      }

      if (!nextUser) {
        await fetch("/api/auth/session", {
          method: "DELETE"
        }).catch(() => undefined);
        setUser(null);
        setLoading(false);
        return;
      }

      try {
        await syncServerSession(nextUser);
        if (!cancelled) {
          setUser(nextUser);
        }
      } catch {
        if (!cancelled) {
          setUser(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      signIn: async (email, password) => {
        try {
          const credential = await signInWithEmailAndPassword(firebaseAuth, email, password);
          await syncServerSession(credential.user);
          setUser(credential.user);
        } catch (error) {
          throw new Error(toSignInErrorMessage(error));
        }
      },
      signOut: async () => {
        await fetch("/api/auth/session", {
          method: "DELETE"
        }).catch(() => undefined);
        await firebaseSignOut(firebaseAuth);
        setUser(null);
      }
    }),
    [loading, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }

  return context;
}
