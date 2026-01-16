"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Brain, ArrowLeft, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default function SignUpPage() {
  const [tenantId, setTenantId] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [copied, setCopied] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080"}/api/keys`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            tenantId: tenantId || `user_${Date.now()}`,
            plan: "free",
            name: name || "My First Key",
          }),
        }
      );

      const data = await response.json();

      if (data.success) {
        setApiKey(data.data.apiKey);
      } else {
        setError(data.error?.message || "Failed to create API key");
      }
    } catch {
      setError("Failed to create API key. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async () => {
    await navigator.clipboard.writeText(apiKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const continueToLogin = () => {
    localStorage.setItem("recall_api_key", apiKey);
    router.push("/dashboard");
  };

  if (apiKey) {
    return (
      <div className="min-h-screen gradient-bg flex items-center justify-center px-4">
        <div className="w-full max-w-md">
          <Card className="bg-card/50 backdrop-blur-sm">
            <CardHeader className="text-center">
              <div className="flex justify-center mb-4">
                <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center">
                  <Check className="w-8 h-8 text-green-500" />
                </div>
              </div>
              <CardTitle className="text-2xl">Your API Key is Ready!</CardTitle>
              <CardDescription>
                Copy and save this key securely. You won&apos;t be able to see it again.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="relative mb-6">
                <div className="bg-background border rounded-md p-4 font-mono text-sm break-all">
                  {apiKey}
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="absolute top-2 right-2"
                  onClick={copyToClipboard}
                >
                  {copied ? (
                    <Check className="w-4 h-4 text-green-500" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </Button>
              </div>

              <div className="space-y-4">
                <Button onClick={continueToLogin} className="w-full">
                  Continue to Dashboard
                </Button>
                <p className="text-xs text-center text-muted-foreground">
                  Your API key has been saved. You can also use it to configure your MCP client.
                </p>
              </div>
            </CardContent>
          </Card>
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
            <CardTitle className="text-2xl">Create your account</CardTitle>
            <CardDescription>
              Get your free API key and start building
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="name"
                  className="block text-sm font-medium mb-2"
                >
                  Key Name (optional)
                </label>
                <input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="My First Key"
                  className="w-full px-3 py-2 bg-background border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div>
                <label
                  htmlFor="tenantId"
                  className="block text-sm font-medium mb-2"
                >
                  Tenant ID (optional)
                </label>
                <input
                  id="tenantId"
                  type="text"
                  value={tenantId}
                  onChange={(e) => setTenantId(e.target.value)}
                  placeholder="my-project"
                  className="w-full px-3 py-2 bg-background border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  A unique identifier for your data. Leave blank to auto-generate.
                </p>
              </div>

              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Creating..." : "Create API Key"}
              </Button>
            </form>

            <div className="mt-6 text-center text-sm text-muted-foreground">
              Already have an API key?{" "}
              <Link href="/sign-in" className="text-primary hover:underline">
                Sign in
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
