"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import {
  User,
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged,
} from "firebase/auth";
import { auth, githubProvider, googleProvider } from "@/lib/firebase";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  apiKey: string | null;
  signInWithGitHub: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  error: string | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Listen to auth state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUser(user);

      if (user) {
        // Check for existing API key in localStorage
        const storedKey = localStorage.getItem("recall_api_key");
        if (storedKey) {
          setApiKey(storedKey);
        } else {
          // Auto-create API key for new user
          await createApiKeyForUser(user);
        }
      } else {
        setApiKey(null);
        localStorage.removeItem("recall_api_key");
      }

      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Create API key for user based on their Firebase UID
  const createApiKeyForUser = async (user: User) => {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "";

      // First, try to get existing key by checking if we have one stored for this user
      const userKeyId = `recall_user_${user.uid}`;
      const existingKey = localStorage.getItem(userKeyId);

      if (existingKey) {
        // Validate the existing key
        const validateResponse = await fetch(`${apiUrl}/api/me`, {
          headers: { Authorization: `Bearer ${existingKey}` },
        });

        if (validateResponse.ok) {
          setApiKey(existingKey);
          localStorage.setItem("recall_api_key", existingKey);
          return;
        }
      }

      // Create new API key using Firebase UID as tenant ID
      const response = await fetch(`${apiUrl}/api/keys`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId: user.uid,
          plan: "free",
          name: user.displayName || user.email || "Firebase User",
        }),
      });

      const data = await response.json();

      if (data.success && data.data.apiKey) {
        const newKey = data.data.apiKey;
        setApiKey(newKey);
        localStorage.setItem("recall_api_key", newKey);
        localStorage.setItem(userKeyId, newKey);
      } else {
        console.error("Failed to create API key:", data);
        setError("Failed to create API key");
      }
    } catch (err) {
      console.error("Error creating API key:", err);
      setError("Failed to create API key");
    }
  };

  const signInWithGitHub = async () => {
    try {
      setError(null);
      setLoading(true);
      await signInWithPopup(auth, githubProvider);
    } catch (err: unknown) {
      console.error("GitHub sign-in error:", err);
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Failed to sign in with GitHub");
      }
      setLoading(false);
    }
  };

  const signInWithGoogle = async () => {
    try {
      setError(null);
      setLoading(true);
      await signInWithPopup(auth, googleProvider);
    } catch (err: unknown) {
      console.error("Google sign-in error:", err);
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Failed to sign in with Google");
      }
      setLoading(false);
    }
  };

  const signOut = async () => {
    try {
      await firebaseSignOut(auth);
      localStorage.removeItem("recall_api_key");
      // Don't remove the user-specific key so they can recover it if they sign in again
    } catch (err: unknown) {
      console.error("Sign-out error:", err);
      if (err instanceof Error) {
        setError(err.message);
      }
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        apiKey,
        signInWithGitHub,
        signInWithGoogle,
        signOut,
        error,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
