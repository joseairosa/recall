import { initializeApp, getApps, FirebaseApp } from "firebase/app";
import { getAuth, GithubAuthProvider, GoogleAuthProvider, Auth } from "firebase/auth";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "recallmcp.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "recallmcp",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "recallmcp.firebasestorage.app",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "130108573765",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:130108573765:web:0abb4a2b547c6d299cfb2c",
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID || "G-63LTZ71RJE",
};

// Initialize Firebase only in browser environment
// This prevents SSG errors during build
let app: FirebaseApp | undefined;
let auth: Auth | undefined;
let githubProvider: GithubAuthProvider | undefined;
let googleProvider: GoogleAuthProvider | undefined;
let firebaseError: string | undefined;

if (typeof window !== "undefined") {
  // Check if API key is configured
  if (!firebaseConfig.apiKey) {
    console.warn("[Firebase] API key not configured - authentication will be disabled");
    firebaseError = "Firebase API key not configured";
  } else {
    try {
      // Initialize Firebase (prevent re-initialization in development)
      app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

      // Auth instance
      auth = getAuth(app);

      // Auth providers
      githubProvider = new GithubAuthProvider();
      googleProvider = new GoogleAuthProvider();

      // Add scopes for GitHub
      githubProvider.addScope("read:user");
      githubProvider.addScope("user:email");
    } catch (error) {
      console.error("[Firebase] Initialization failed:", error);
      firebaseError = error instanceof Error ? error.message : "Firebase initialization failed";
    }
  }
}

export { auth, githubProvider, googleProvider, firebaseError };
export default app;
