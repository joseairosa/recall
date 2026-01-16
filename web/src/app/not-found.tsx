import Link from "next/link";
import { Brain, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="min-h-screen gradient-bg flex items-center justify-center px-4">
      <div className="text-center">
        <Brain className="w-16 h-16 text-primary mx-auto mb-6" />
        <h1 className="text-4xl font-bold mb-4">404</h1>
        <p className="text-xl text-muted-foreground mb-8">
          Page not found
        </p>
        <Link href="/">
          <Button>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Home
          </Button>
        </Link>
      </div>
    </div>
  );
}
