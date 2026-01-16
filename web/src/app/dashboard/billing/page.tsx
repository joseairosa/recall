"use client";

import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  CreditCard,
  Check,
  Sparkles,
  Building2,
  Zap,
  Crown,
  ExternalLink,
  Loader2,
} from "lucide-react";
import { api, TenantInfo } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

interface PricingTier {
  name: string;
  price: string;
  priceId: string | null;
  description: string;
  features: string[];
  highlighted?: boolean;
  icon: React.ReactNode;
  buttonText: string;
  disabled?: boolean;
}

const pricingTiers: PricingTier[] = [
  {
    name: "Free",
    price: "$0",
    priceId: null,
    description: "Perfect for trying out Recall",
    icon: <Zap className="w-5 h-5" />,
    buttonText: "Current Plan",
    disabled: true,
    features: [
      "500 memories",
      "1 workspace",
      "Basic semantic search",
      "Community support",
    ],
  },
  {
    name: "Pro",
    price: "$9",
    priceId: "price_1SqGK8LUbfmx8MWFMzZ2WTsz",
    description: "For individuals and power users",
    icon: <Sparkles className="w-5 h-5" />,
    buttonText: "Upgrade to Pro",
    highlighted: true,
    features: [
      "10,000 memories",
      "5 workspaces",
      "Advanced semantic search",
      "REST API access",
      "Priority support",
      "Custom tags & metadata",
    ],
  },
  {
    name: "Team",
    price: "$29",
    priceId: "price_1SqGL4LUbfmx8MWFjxlB3B7F",
    description: "For teams and organizations",
    icon: <Building2 className="w-5 h-5" />,
    buttonText: "Upgrade to Team",
    features: [
      "50,000 memories",
      "Unlimited workspaces",
      "Shared team memories",
      "Admin dashboard",
      "SSO authentication",
      "Dedicated support",
      "Custom integrations",
    ],
  },
  {
    name: "Enterprise",
    price: "Custom",
    priceId: null,
    description: "For large-scale deployments",
    icon: <Crown className="w-5 h-5" />,
    buttonText: "Contact Sales",
    disabled: true,
    features: [
      "Unlimited memories",
      "Self-hosted option",
      "Custom SLA",
      "On-premise deployment",
      "Dedicated account manager",
      "Custom contracts",
    ],
  },
];

export default function BillingPage() {
  const { user } = useAuth();
  const [tenantInfo, setTenantInfo] = useState<TenantInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);

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

  const handleUpgrade = async (priceId: string) => {
    if (!user) return;

    setCheckoutLoading(priceId);

    try {
      const idToken = await user.getIdToken();
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "";

      const response = await fetch(`${apiUrl}/api/billing/checkout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          priceId,
          successUrl: `${window.location.origin}/dashboard/billing?success=true`,
          cancelUrl: `${window.location.origin}/dashboard/billing?canceled=true`,
        }),
      });

      const data = await response.json();

      if (data.success && data.data.url) {
        window.location.href = data.data.url;
      } else {
        console.error("Failed to create checkout session:", data);
        alert(data.error?.message || "Failed to create checkout session");
      }
    } catch (error) {
      console.error("Checkout error:", error);
      alert("Failed to start checkout process");
    } finally {
      setCheckoutLoading(null);
    }
  };

  const handleManageBilling = async () => {
    if (!user) return;

    setPortalLoading(true);

    try {
      const idToken = await user.getIdToken();
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "";

      const response = await fetch(`${apiUrl}/api/billing/portal`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          returnUrl: `${window.location.origin}/dashboard/billing`,
        }),
      });

      const data = await response.json();

      if (data.success && data.data.url) {
        window.location.href = data.data.url;
      } else {
        console.error("Failed to create portal session:", data);
        alert(data.error?.message || "Failed to open billing portal");
      }
    } catch (error) {
      console.error("Portal error:", error);
      alert("Failed to open billing portal");
    } finally {
      setPortalLoading(false);
    }
  };

  const currentPlan = tenantInfo?.plan || "free";

  // Check for success/cancel URL params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("success") === "true") {
      // Could show a success toast here
      window.history.replaceState({}, "", "/dashboard/billing");
    }
    if (params.get("canceled") === "true") {
      window.history.replaceState({}, "", "/dashboard/billing");
    }
  }, []);

  if (loading) {
    return (
      <div className="animate-pulse space-y-6">
        <div className="h-8 bg-muted rounded w-48" />
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-96 bg-muted rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Billing & Subscription</h1>
        <p className="text-muted-foreground mt-1">
          Manage your subscription and billing information.
        </p>
      </div>

      {/* Current Plan Summary */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <CreditCard className="w-5 h-5 text-primary" />
            <CardTitle>Current Plan</CardTitle>
          </div>
          <CardDescription>
            Your current subscription and usage
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 p-4 bg-muted rounded-lg">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-primary/10 rounded-lg">
                {currentPlan === "free" && <Zap className="w-6 h-6 text-primary" />}
                {currentPlan === "pro" && <Sparkles className="w-6 h-6 text-primary" />}
                {currentPlan === "team" && <Building2 className="w-6 h-6 text-primary" />}
                {currentPlan === "enterprise" && <Crown className="w-6 h-6 text-primary" />}
              </div>
              <div>
                <p className="font-semibold text-lg capitalize">{currentPlan} Plan</p>
                <p className="text-sm text-muted-foreground">
                  {tenantInfo?.usage.memories} / {tenantInfo?.limits.maxMemories} memories used
                </p>
              </div>
            </div>
            {currentPlan !== "free" && (
              <Button
                variant="outline"
                onClick={handleManageBilling}
                disabled={portalLoading}
              >
                {portalLoading ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <ExternalLink className="w-4 h-4 mr-2" />
                )}
                Manage Billing
              </Button>
            )}
          </div>

          {/* Usage Progress Bar */}
          <div className="mt-4">
            <div className="flex justify-between text-sm mb-2">
              <span className="text-muted-foreground">Memory Usage</span>
              <span className="font-medium">
                {Math.round(
                  ((tenantInfo?.usage.memories || 0) /
                    (tenantInfo?.limits.maxMemories || 1)) *
                    100
                )}
                %
              </span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all"
                style={{
                  width: `${Math.min(
                    ((tenantInfo?.usage.memories || 0) /
                      (tenantInfo?.limits.maxMemories || 1)) *
                      100,
                    100
                  )}%`,
                }}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Pricing Tiers */}
      <div>
        <h2 className="text-xl font-semibold mb-4">Available Plans</h2>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {pricingTiers.map((tier) => {
            const isCurrentPlan = tier.name.toLowerCase() === currentPlan;
            const currentPlanIndex = pricingTiers.findIndex((t) => t.name.toLowerCase() === currentPlan);
            const tierIndex = pricingTiers.findIndex((t) => t.name === tier.name);
            const isUpgrade = !isCurrentPlan && tier.priceId && currentPlanIndex < tierIndex;
            const isDowngrade = !isCurrentPlan && currentPlanIndex > tierIndex;

            return (
              <Card
                key={tier.name}
                className={cn(
                  "relative flex flex-col",
                  tier.highlighted && "border-primary shadow-lg",
                  isCurrentPlan && "ring-2 ring-primary"
                )}
              >
                {tier.highlighted && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="bg-primary text-primary-foreground text-xs font-medium px-3 py-1 rounded-full">
                      Most Popular
                    </span>
                  </div>
                )}
                {isCurrentPlan && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="bg-green-500 text-white text-xs font-medium px-3 py-1 rounded-full">
                      Current Plan
                    </span>
                  </div>
                )}
                <CardHeader className="pb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="p-2 bg-primary/10 rounded-lg">{tier.icon}</div>
                    <CardTitle className="text-lg">{tier.name}</CardTitle>
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-bold">{tier.price}</span>
                    {tier.price !== "Custom" && (
                      <span className="text-muted-foreground">/month</span>
                    )}
                  </div>
                  <CardDescription className="mt-2">
                    {tier.description}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col">
                  <ul className="space-y-2 flex-1">
                    {tier.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2 text-sm">
                        <Check className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-6">
                    {isCurrentPlan ? (
                      <Button variant="outline" className="w-full" disabled>
                        Current Plan
                      </Button>
                    ) : tier.name === "Enterprise" ? (
                      <Button variant="outline" className="w-full" asChild>
                        <a href="mailto:support@recall.dev">Contact Sales</a>
                      </Button>
                    ) : isUpgrade && tier.priceId ? (
                      <Button
                        className="w-full"
                        onClick={() => handleUpgrade(tier.priceId!)}
                        disabled={checkoutLoading === tier.priceId}
                      >
                        {checkoutLoading === tier.priceId ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Processing...
                          </>
                        ) : (
                          tier.buttonText
                        )}
                      </Button>
                    ) : isDowngrade ? (
                      <Button variant="outline" className="w-full" disabled>
                        Included in your plan
                      </Button>
                    ) : (
                      <Button variant="outline" className="w-full" disabled>
                        {tier.buttonText}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* FAQ */}
      <Card>
        <CardHeader>
          <CardTitle>Frequently Asked Questions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h4 className="font-medium">Can I cancel anytime?</h4>
            <p className="text-sm text-muted-foreground mt-1">
              Yes, you can cancel your subscription at any time. Your access will
              continue until the end of your billing period.
            </p>
          </div>
          <div>
            <h4 className="font-medium">What happens to my data if I downgrade?</h4>
            <p className="text-sm text-muted-foreground mt-1">
              Your data is preserved, but you won&apos;t be able to add new memories
              if you exceed your plan&apos;s limit. You can delete old memories to
              stay within limits.
            </p>
          </div>
          <div>
            <h4 className="font-medium">Do you offer annual billing?</h4>
            <p className="text-sm text-muted-foreground mt-1">
              Yes! Contact us for annual billing options with 2 months free.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
