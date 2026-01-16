"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { User, CreditCard, AlertCircle } from "lucide-react";
import { api, TenantInfo } from "@/lib/api";

export default function SettingsPage() {
  const [tenantInfo, setTenantInfo] = useState<TenantInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      const apiKey = localStorage.getItem("recall_api_key");
      if (!apiKey) return;

      api.setApiKey(apiKey);

      const response = await api.getMe();
      if (response.success && response.data) {
        setTenantInfo(response.data);
      }

      setLoading(false);
    };

    loadData();
  }, []);

  if (loading) {
    return (
      <div className="animate-pulse space-y-6">
        <div className="h-8 bg-muted rounded w-48" />
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-32 bg-muted rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground mt-1">
          Manage your account and subscription settings.
        </p>
      </div>

      {/* Account Info */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <User className="w-5 h-5 text-primary" />
            <CardTitle>Account</CardTitle>
          </div>
          <CardDescription>Your account information</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="space-y-4">
            <div className="flex justify-between py-2 border-b">
              <dt className="text-muted-foreground">Tenant ID</dt>
              <dd className="font-mono text-sm">{tenantInfo?.tenantId}</dd>
            </div>
            <div className="flex justify-between py-2 border-b">
              <dt className="text-muted-foreground">Plan</dt>
              <dd className="capitalize">{tenantInfo?.plan}</dd>
            </div>
            <div className="flex justify-between py-2 border-b">
              <dt className="text-muted-foreground">Memories Used</dt>
              <dd>
                {tenantInfo?.usage.memories} / {tenantInfo?.limits.maxMemories}
              </dd>
            </div>
            <div className="flex justify-between py-2">
              <dt className="text-muted-foreground">Workspaces Limit</dt>
              <dd>
                {tenantInfo?.limits.maxWorkspaces === -1
                  ? "Unlimited"
                  : tenantInfo?.limits.maxWorkspaces}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {/* Subscription */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <CreditCard className="w-5 h-5 text-primary" />
            <CardTitle>Subscription</CardTitle>
          </div>
          <CardDescription>Manage your subscription and billing</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
            <div>
              <p className="font-medium capitalize">{tenantInfo?.plan} Plan</p>
              <p className="text-sm text-muted-foreground">
                {tenantInfo?.plan === "free"
                  ? "Upgrade to unlock more features"
                  : "Thank you for your subscription!"}
              </p>
            </div>
            {tenantInfo?.plan === "free" && (
              <Button>Upgrade to Pro</Button>
            )}
          </div>

          {tenantInfo?.plan === "free" && (
            <div className="mt-6 space-y-4">
              <h4 className="font-medium">Pro Plan Benefits</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>10,000 memories (20x more)</li>
                <li>5 workspaces</li>
                <li>Advanced semantic search</li>
                <li>REST API access</li>
                <li>Email support</li>
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Danger Zone */}
      <Card className="border-destructive/50">
        <CardHeader>
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-destructive" />
            <CardTitle className="text-destructive">Danger Zone</CardTitle>
          </div>
          <CardDescription>
            Irreversible and destructive actions
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between p-4 border border-destructive/20 rounded-lg">
            <div>
              <p className="font-medium">Delete All Data</p>
              <p className="text-sm text-muted-foreground">
                Permanently delete all memories and data. This cannot be undone.
              </p>
            </div>
            <Button variant="destructive" disabled>
              Delete All Data
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
