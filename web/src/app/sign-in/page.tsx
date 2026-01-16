"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Brain, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default function SignInPage() {
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      // Validate the API key by making a test request
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080"}/api/me`,
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
          },
        }
      );

      const data = await response.json();

      if (data.success) {
        // Store API key in localStorage (in production, use a more secure method)
        localStorage.setItem("recall_api_key", apiKey);
        router.push("/dashboard");
      } else {
        setError(data.error?.message || "Invalid API key");
      }
    } catch {
      setError("Failed to validate API key. Please try again.");
    } finally {
      setLoading(false);
    }
  };

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
            <CardTitle className="text-2xl">Welcome back</CardTitle>
            <CardDescription>
              Enter your API key to access your dashboard
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="apiKey"
                  className="block text-sm font-medium mb-2"
                >
                  API Key
                </label>
                <input
                  id="apiKey"
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-..."
                  className="w-full px-3 py-2 bg-background border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                  required
                />
              </div>

              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Signing in..." : "Sign In"}
              </Button>
            </form>

            <div className="mt-6 text-center text-sm text-muted-foreground">
              Don&apos;t have an API key?{" "}
              <Link href="/sign-up" className="text-primary hover:underline">
                Get started
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
