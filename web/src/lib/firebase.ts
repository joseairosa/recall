import { initializeApp, getApps } from "firebase/app";
import { getAuth, GithubAuthProvider, GoogleAuthProvider } from "firebase/auth";

const firebaseConfig = {
  apiKey: "REDACTED_FIREBASE_KEY",
  authDomain: "recallmcp.firebaseapp.com",
  projectId: "recallmcp",
  storageBucket: "recallmcp.firebasestorage.app",
  messagingSenderId: "130108573765",
  appId: "1:130108573765:web:0abb4a2b547c6d299cfb2c",
  measurementId: "G-63LTZ71RJE",
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
