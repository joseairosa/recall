"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Brain,
  Search,
  Shield,
  Zap,
  Code,
  Globe,
  Check,
  ArrowRight,
  Menu,
  X,
  Github,
  Twitter,
} from "lucide-react";

export default function HomePage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div className="min-h-screen gradient-bg">
      {/* Navigation */}
      <nav
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          scrolled ? "bg-background/80 backdrop-blur-lg border-b" : ""
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-2">
              <Brain className="w-8 h-8 text-primary" />
              <span className="text-xl font-bold gradient-text">Recall</span>
            </div>

            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center gap-8">
              <a
                href="#features"
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                Features
              </a>
              <a
                href="#pricing"
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                Pricing
              </a>
              <a
                href="#how-it-works"
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                How it Works
              </a>
              <a
                href="https://github.com/joseairosa/recall"
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                Docs
              </a>
            </div>

            <div className="hidden md:flex items-center gap-4">
              <Link href="/sign-in">
                <Button variant="ghost">Sign In</Button>
              </Link>
              <Link href="/sign-up">
                <Button>Get Started</Button>
              </Link>
            </div>

            {/* Mobile menu button */}
            <button
              className="md:hidden"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? (
                <X className="w-6 h-6" />
              ) : (
                <Menu className="w-6 h-6" />
              )}
            </button>
          </div>
        </div>

        {/* Mobile Navigation */}
        {mobileMenuOpen && (
          <div className="md:hidden bg-background/95 backdrop-blur-lg border-b">
            <div className="px-4 py-4 space-y-4">
              <a
                href="#features"
                className="block text-muted-foreground hover:text-foreground"
              >
                Features
              </a>
              <a
                href="#pricing"
                className="block text-muted-foreground hover:text-foreground"
              >
                Pricing
              </a>
              <a
                href="#how-it-works"
                className="block text-muted-foreground hover:text-foreground"
              >
                How it Works
              </a>
              <div className="pt-4 flex flex-col gap-2">
                <Link href="/sign-in">
                  <Button variant="ghost" className="w-full">
                    Sign In
                  </Button>
                </Link>
                <Link href="/sign-up">
                  <Button className="w-full">Get Started</Button>
                </Link>
              </div>
            </div>
          </div>
        )}
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto text-center">
          <div className="animate-fade-up">
            <div className="inline-flex items-center gap-2 bg-primary/10 border border-primary/20 rounded-full px-4 py-2 mb-8">
              <Zap className="w-4 h-4 text-primary" />
              <span className="text-sm text-primary">
                Now with 7 AI Embedding Providers
              </span>
            </div>

            <h1 className="text-4xl sm:text-6xl lg:text-7xl font-bold mb-6">
              <span className="gradient-text">Memory-as-a-Service</span>
              <br />
              <span className="text-foreground">for AI Agents</span>
            </h1>

            <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-10">
              Give your AI agents persistent memory that survives context
              windows. Semantic search, multi-tenant isolation, and native MCP
              protocol support.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/sign-up">
                <Button size="lg" className="glow-border">
                  Get Started Free
                  <ArrowRight className="ml-2 w-4 h-4" />
                </Button>
              </Link>
              <a
                href="https://github.com/joseairosa/recall"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button size="lg" variant="outline">
                  <Github className="mr-2 w-4 h-4" />
                  View on GitHub
                </Button>
              </a>
            </div>
          </div>

          {/* Code Preview */}
          <div className="mt-16 animate-fade-up">
            <div className="bg-card/50 border rounded-xl p-6 max-w-3xl mx-auto text-left">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-3 h-3 rounded-full bg-red-500" />
                <div className="w-3 h-3 rounded-full bg-yellow-500" />
                <div className="w-3 h-3 rounded-full bg-green-500" />
                <span className="ml-4 text-sm text-muted-foreground">
                  claude_desktop_config.json
                </span>
              </div>
              <pre className="text-sm overflow-x-auto">
                <code className="text-muted-foreground">
                  {`{
  "mcpServers": {
    "recall": {
      "url": "https://api.recall.dev/mcp",
      "headers": {
        "Authorization": "Bearer sk-your-api-key"
      }
    }
  }
}`}
                </code>
              </pre>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              Everything you need for{" "}
              <span className="gradient-text">AI memory</span>
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Built for developers who want their AI agents to remember
              conversations, learn patterns, and maintain context across
              sessions.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            <FeatureCard
              icon={<Search className="w-6 h-6" />}
              title="Semantic Search"
              description="Vector embeddings with cosine similarity. Find memories by meaning, not just keywords."
            />
            <FeatureCard
              icon={<Shield className="w-6 h-6" />}
              title="Multi-Tenant Isolation"
              description="Complete data isolation per API key. Your memories are yours alone."
            />
            <FeatureCard
              icon={<Globe className="w-6 h-6" />}
              title="7 Embedding Providers"
              description="Voyage AI, Cohere, OpenAI, Deepseek, Grok, Anthropic, or self-hosted Ollama."
            />
            <FeatureCard
              icon={<Code className="w-6 h-6" />}
              title="MCP Native"
              description="First-class Model Context Protocol support. Works with Claude, Cursor, and more."
            />
            <FeatureCard
              icon={<Zap className="w-6 h-6" />}
              title="REST API"
              description="Simple HTTP endpoints for any client. CRUD operations, search, and batch processing."
            />
            <FeatureCard
              icon={<Brain className="w-6 h-6" />}
              title="Context Types"
              description="Organize memories by type: decisions, patterns, preferences, errors, and more."
            />
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              Simple, <span className="gradient-text">transparent</span> pricing
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Start free, scale as you grow. No hidden fees, no usage surprises.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            <PricingCard
              name="Free"
              price="$0"
              description="Perfect for trying out Recall"
              features={[
                "500 memories",
                "1 workspace",
                "Basic semantic search",
                "Community support",
              ]}
            />
            <PricingCard
              name="Pro"
              price="$9"
              description="For individual developers"
              features={[
                "10,000 memories",
                "5 workspaces",
                "Advanced search",
                "REST API access",
                "Email support",
              ]}
              highlighted
            />
            <PricingCard
              name="Team"
              price="$29"
              description="For teams and production apps"
              features={[
                "50,000 memories",
                "Unlimited workspaces",
                "Shared memories",
                "Priority support",
                "Audit logging",
              ]}
            />
          </div>
        </div>
      </section>

      {/* How it Works Section */}
      <section id="how-it-works" className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              Get started in <span className="gradient-text">3 minutes</span>
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              From signup to AI with memory in just a few steps.
            </p>
          </div>

          <div className="grid md:grid-cols-4 gap-8">
            <StepCard
              number={1}
              title="Sign Up"
              description="Create your free account. No credit card required."
            />
            <StepCard
              number={2}
              title="Get API Key"
              description="Generate your API key from the dashboard."
            />
            <StepCard
              number={3}
              title="Configure MCP"
              description="Add Recall to your Claude or AI client config."
            />
            <StepCard
              number={4}
              title="Done!"
              description="Your AI now has persistent memory across sessions."
            />
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <div className="bg-card/50 border rounded-2xl p-12">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              Ready to give your AI{" "}
              <span className="gradient-text">perfect memory</span>?
            </h2>
            <p className="text-muted-foreground mb-8">
              Join hundreds of developers building smarter AI applications.
            </p>
            <Link href="/sign-up">
              <Button size="lg" className="glow-border">
                Start Building for Free
                <ArrowRight className="ml-2 w-4 h-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row justify-between items-center gap-8">
            <div className="flex items-center gap-2">
              <Brain className="w-6 h-6 text-primary" />
              <span className="font-bold gradient-text">Recall</span>
            </div>

            <div className="flex gap-8 text-sm text-muted-foreground">
              <a href="#features" className="hover:text-foreground">
                Features
              </a>
              <a href="#pricing" className="hover:text-foreground">
                Pricing
              </a>
              <a
                href="https://github.com/joseairosa/recall"
                className="hover:text-foreground"
              >
                Docs
              </a>
              <a href="/privacy" className="hover:text-foreground">
                Privacy
              </a>
              <a href="/terms" className="hover:text-foreground">
                Terms
              </a>
            </div>

            <div className="flex gap-4">
              <a
                href="https://github.com/joseairosa/recall"
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-foreground"
              >
                <Github className="w-5 h-5" />
              </a>
              <a
                href="https://twitter.com/joseairosa"
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-foreground"
              >
                <Twitter className="w-5 h-5" />
              </a>
            </div>
          </div>

          <div className="mt-8 text-center text-sm text-muted-foreground">
            &copy; {new Date().getFullYear()} Recall. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <Card className="bg-card/50 hover:bg-card/80 transition-colors">
      <CardHeader>
        <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center text-primary mb-4">
          {icon}
        </div>
        <CardTitle className="text-lg">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
    </Card>
  );
}

function PricingCard({
  name,
  price,
  description,
  features,
  highlighted = false,
}: {
  name: string;
  price: string;
  description: string;
  features: string[];
  highlighted?: boolean;
}) {
  return (
    <Card
      className={`relative ${
        highlighted ? "border-primary bg-card/80" : "bg-card/50"
      }`}
    >
      {highlighted && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <span className="bg-primary text-primary-foreground text-xs font-medium px-3 py-1 rounded-full">
            Most Popular
          </span>
        </div>
      )}
      <CardHeader>
        <CardTitle className="text-xl">{name}</CardTitle>
        <div className="mt-4">
          <span className="text-4xl font-bold">{price}</span>
          <span className="text-muted-foreground">/month</span>
        </div>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="space-y-3">
          {features.map((feature, i) => (
            <li key={i} className="flex items-center gap-3">
              <Check className="w-4 h-4 text-primary" />
              <span className="text-sm">{feature}</span>
            </li>
          ))}
        </ul>
        <Link href="/sign-up" className="block mt-6">
          <Button
            className="w-full"
            variant={highlighted ? "default" : "outline"}
          >
            Get Started
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}

function StepCard({
  number,
  title,
  description,
}: {
  number: number;
  title: string;
  description: string;
}) {
  return (
    <div className="text-center">
      <div className="w-12 h-12 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary font-bold text-xl mx-auto mb-4">
        {number}
      </div>
      <h3 className="font-semibold mb-2">{title}</h3>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
}
