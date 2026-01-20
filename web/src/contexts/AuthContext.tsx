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
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  updateProfile,
} from "firebase/auth";
import { auth, githubProvider, googleProvider } from "@/lib/firebase";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  apiKey: string | null;
  signInWithGitHub: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string, name?: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
  error: string | null;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Listen to auth state changes
  useEffect(() => {
    // Skip if auth is not initialized (SSR)
    if (!auth) {
      setLoading(false);
      return;
    }

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

  // Get API base URL at runtime
  const getApiUrl = () => {
    if (process.env.NEXT_PUBLIC_API_URL) {
      return process.env.NEXT_PUBLIC_API_URL;
    }
    // In browser, use relative URLs for production (same domain)
    if (typeof window !== "undefined" && window.location.hostname !== "localhost") {
      return "";
    }
    // Development fallback
    return "http://localhost:8080";
  };

  // Create API key for user based on their Firebase UID
  const createApiKeyForUser = async (user: User) => {
    try {
      const apiUrl = getApiUrl();

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

      // Get Firebase ID token for authentication
      const idToken = await user.getIdToken();

      // Create or retrieve API key using Firebase authentication
      const response = await fetch(`${apiUrl}/api/auth/keys`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${idToken}`,
        },
      });

      const data = await response.json();

      if (data.success && data.data.apiKey) {
        // API key created or retrieved
        const key = data.data.apiKey;
        setApiKey(key);
        localStorage.setItem("recall_api_key", key);
        localStorage.setItem(userKeyId, key);
        console.log("API key set successfully");
      } else if (!data.success) {
        console.error("Failed to create API key:", data);
        setError(data.error?.message || "Failed to create API key");
      }
    } catch (err) {
      console.error("Error creating API key:", err);
      setError("Failed to create API key");
    }
  };

  const clearError = () => setError(null);

  // Helper to get user-friendly error messages
  const getErrorMessage = (error: unknown): string => {
    if (error instanceof Error) {
      const message = error.message;
      // Firebase error codes
      if (message.includes("auth/invalid-credential") || message.includes("auth/wrong-password")) {
        return "Invalid email or password";
      }
      if (message.includes("auth/user-not-found")) {
        return "No account found with this email";
      }
      if (message.includes("auth/email-already-in-use")) {
        return "An account with this email already exists";
      }
      if (message.includes("auth/weak-password")) {
        return "Password should be at least 6 characters";
      }
      if (message.includes("auth/invalid-email")) {
        return "Invalid email address";
      }
      if (message.includes("auth/too-many-requests")) {
        return "Too many attempts. Please try again later";
      }
      if (message.includes("auth/popup-closed-by-user")) {
        return "Sign-in was cancelled";
      }
      return message;
    }
    return "An unexpected error occurred";
  };

  const signInWithGitHub = async () => {
    if (!auth || !githubProvider) {
      setError("Authentication not initialized");
      return;
    }
    try {
      setError(null);
      setLoading(true);
      await signInWithPopup(auth, githubProvider);
    } catch (err: unknown) {
      console.error("GitHub sign-in error:", err);
      setError(getErrorMessage(err));
      setLoading(false);
    }
  };

  const signInWithGoogle = async () => {
    if (!auth || !googleProvider) {
      setError("Authentication not initialized");
      return;
    }
    try {
      setError(null);
      setLoading(true);
      await signInWithPopup(auth, googleProvider);
    } catch (err: unknown) {
      console.error("Google sign-in error:", err);
      setError(getErrorMessage(err));
      setLoading(false);
    }
  };

  const signInWithEmail = async (email: string, password: string) => {
    if (!auth) {
      setError("Authentication not initialized");
      return;
    }
    try {
      setError(null);
      setLoading(true);
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err: unknown) {
      console.error("Email sign-in error:", err);
      setError(getErrorMessage(err));
      setLoading(false);
    }
  };

  const signUpWithEmail = async (email: string, password: string, name?: string) => {
    if (!auth) {
      setError("Authentication not initialized");
      return;
    }
    try {
      setError(null);
      setLoading(true);
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);

      // Update display name if provided
      if (name && userCredential.user) {
        await updateProfile(userCredential.user, { displayName: name });
      }
    } catch (err: unknown) {
      console.error("Email sign-up error:", err);
      setError(getErrorMessage(err));
      setLoading(false);
    }
  };

  const resetPassword = async (email: string) => {
    if (!auth) {
      setError("Authentication not initialized");
      throw new Error("Authentication not initialized");
    }
    try {
      setError(null);
      await sendPasswordResetEmail(auth, email);
    } catch (err: unknown) {
      console.error("Password reset error:", err);
      setError(getErrorMessage(err));
      throw err; // Re-throw so the component can handle success/failure
    }
  };

  const signOut = async () => {
    if (!auth) {
      return;
    }
    try {
      await firebaseSignOut(auth);
      localStorage.removeItem("recall_api_key");
      // Don't remove the user-specific key so they can recover it if they sign in again
    } catch (err: unknown) {
      console.error("Sign-out error:", err);
      setError(getErrorMessage(err));
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
        signInWithEmail,
        signUpWithEmail,
        resetPassword,
        signOut,
        error,
        clearError,
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
