"use client";

import { Button } from "@liveboard/ui/components/ui/button";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";

const COOLDOWN_SECONDS = 60;

export function ResendVerificationButton({ email }: { email: string }) {
  const [isSending, setIsSending] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const handleResend = useCallback(async () => {
    if (isSending || cooldown > 0) return;
    setIsSending(true);
    try {
      await authClient.sendVerificationEmail({
        email,
        callbackURL: "/dashboard",
      });
      toast.success("確認メールを再送しました");
      setCooldown(COOLDOWN_SECONDS);
    } catch {
      toast.error("送信に失敗しました。しばらく経ってからお試しください。");
    } finally {
      setIsSending(false);
    }
  }, [email, isSending, cooldown]);

  const isDisabled = isSending || cooldown > 0;

  return (
    <Button
      variant="outline"
      className="w-full"
      onClick={handleResend}
      disabled={isDisabled}
    >
      {isSending
        ? "送信中..."
        : cooldown > 0
          ? `再送する（${cooldown}秒）`
          : "確認メールを再送する"}
    </Button>
  );
}
