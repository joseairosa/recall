import { initializeApp, getApps } from "firebase/app";
import { getAuth, GithubAuthProvider, GoogleAuthProvider } from "firebase/auth";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "recallmcp.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "recallmcp",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "recallmcp.firebasestorage.app",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "130108573765",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:130108573765:web:0abb4a2b547c6d299cfb2c",
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID || "G-63LTZ71RJE",
};

// Initialize Firebase (prevent re-initialization in development)
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

// Auth instance
export const auth = getAuth(app);

// Auth providers
export const githubProvider = new GithubAuthProvider();
export const googleProvider = new GoogleAuthProvider();

// Add scopes for GitHub
githubProvider.addScope("read:user");
githubProvider.addScope("user:email");

export default app;
