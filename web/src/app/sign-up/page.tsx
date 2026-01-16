"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Brain } from "lucide-react";

// Sign-up redirects to sign-in since Firebase handles both through the same OAuth flow
export default function SignUpPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/sign-in");
  }, [router]);

  return (
    <div className="min-h-screen gradient-bg flex items-center justify-center">
      <div className="animate-pulse">
        <Brain className="w-12 h-12 text-primary" />
      </div>
    </div>
  );
}
