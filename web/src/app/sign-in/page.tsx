"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Brain, ArrowLeft, Github, Mail, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";

type AuthMode = "signin" | "signup" | "reset";

export default function SignInPage() {
  const {
    user,
    loading,
    signInWithGitHub,
    signInWithGoogle,
    signInWithEmail,
    signUpWithEmail,
    resetPassword,
    error,
    clearError,
  } = useAuth();
  const router = useRouter();

  const [mode, setMode] = useState<AuthMode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Redirect if already signed in
  useEffect(() => {
    if (user && !loading) {
      router.push("/dashboard");
    }
  }, [user, loading, router]);

  // Clear error when switching modes
  useEffect(() => {
    clearError();
    setResetSent(false);
  }, [mode, clearError]);

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      if (mode === "signin") {
        await signInWithEmail(email, password);
      } else if (mode === "signup") {
        await signUpWithEmail(email, password, name);
      } else if (mode === "reset") {
        await resetPassword(email);
        setResetSent(true);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen gradient-bg flex items-center justify-center">
        <div className="animate-pulse">
          <Brain className="w-12 h-12 text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen gradient-bg flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <Link
          href="/"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-8"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to home
        </Link>

        <Card className="bg-card/50 backdrop-blur-sm">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <Brain className="w-12 h-12 text-primary" />
            </div>
            <CardTitle className="text-2xl">
              {mode === "signin" && "Welcome back"}
              {mode === "signup" && "Create your account"}
              {mode === "reset" && "Reset password"}
            </CardTitle>
            <CardDescription>
              {mode === "signin" && "Sign in to access your AI memory dashboard"}
              {mode === "signup" && "Get started with Recall for free"}
              {mode === "reset" && "Enter your email to receive a reset link"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {error && (
              <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-md">
                {error}
              </div>
            )}

            {resetSent && mode === "reset" && (
              <div className="p-3 text-sm text-green-500 bg-green-500/10 rounded-md">
                Password reset email sent! Check your inbox.
              </div>
            )}

            {mode !== "reset" && (
              <>
                <Button
                  onClick={signInWithGitHub}
                  className="w-full"
                  variant="outline"
                  size="lg"
                  disabled={isSubmitting}
                >
                  <Github className="w-5 h-5 mr-2" />
                  Continue with GitHub
                </Button>

                <Button
                  onClick={signInWithGoogle}
                  className="w-full"
                  variant="outline"
                  size="lg"
                  disabled={isSubmitting}
                >
                  <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
                    <path
                      fill="currentColor"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="currentColor"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="currentColor"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    />
                    <path
                      fill="currentColor"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    />
                  </svg>
                  Continue with Google
                </Button>

                <div className="relative my-6">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-card px-2 text-muted-foreground">
                      Or continue with email
                    </span>
                  </div>
                </div>
              </>
            )}

            <form onSubmit={handleEmailSubmit} className="space-y-4">
              {mode === "signup" && (
                <div>
                  <label htmlFor="name" className="block text-sm font-medium mb-2">
                    Name (optional)
                  </label>
                  <input
                    id="name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your name"
                    className="w-full px-3 py-2 bg-background border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                    disabled={isSubmitting}
                  />
                </div>
              )}

              <div>
                <label htmlFor="email" className="block text-sm font-medium mb-2">
                  Email
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full pl-10 pr-3 py-2 bg-background border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                    required
                    disabled={isSubmitting}
                  />
                </div>
              </div>

              {mode !== "reset" && (
                <div>
                  <label htmlFor="password" className="block text-sm font-medium mb-2">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={mode === "signup" ? "At least 6 characters" : "Your password"}
                      className="w-full px-3 py-2 pr-10 bg-background border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                      required
                      minLength={mode === "signup" ? 6 : undefined}
                      disabled={isSubmitting}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
              )}

              {mode === "signin" && (
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => setMode("reset")}
                    className="text-sm text-primary hover:underline"
                  >
                    Forgot password?
                  </button>
                </div>
              )}

              <Button
                type="submit"
                className="w-full"
                size="lg"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <span className="flex items-center">
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    {mode === "signin" && "Signing in..."}
                    {mode === "signup" && "Creating account..."}
                    {mode === "reset" && "Sending..."}
                  </span>
                ) : (
                  <>
                    {mode === "signin" && "Sign In"}
                    {mode === "signup" && "Create Account"}
                    {mode === "reset" && "Send Reset Link"}
                  </>
                )}
              </Button>
            </form>

            <div className="text-center text-sm text-muted-foreground">
              {mode === "signin" && (
                <>
                  Don&apos;t have an account?{" "}
                  <button
                    onClick={() => setMode("signup")}
                    className="text-primary hover:underline"
                  >
                    Sign up
                  </button>
                </>
              )}
              {mode === "signup" && (
                <>
                  Already have an account?{" "}
                  <button
                    onClick={() => setMode("signin")}
                    className="text-primary hover:underline"
                  >
                    Sign in
                  </button>
                </>
              )}
              {mode === "reset" && (
                <>
                  Remember your password?{" "}
                  <button
                    onClick={() => setMode("signin")}
                    className="text-primary hover:underline"
                  >
                    Sign in
                  </button>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          By signing in, you agree to our{" "}
          <Link href="#" className="underline hover:text-foreground">
            Terms
          </Link>{" "}
          and{" "}
          <Link href="#" className="underline hover:text-foreground">
            Privacy Policy
          </Link>
        </p>
      </div>
    </div>
  );
}
