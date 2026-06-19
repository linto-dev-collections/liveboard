"use client";

import { Alert, AlertDescription } from "@liveboard/ui/components/ui/alert";
import { Button } from "@liveboard/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@liveboard/ui/components/ui/card";
import { AlertTriangleIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";

/**
 * 招待先メールアドレスと現セッションのメールアドレスが一致しないときに表示する。
 *
 * 招待先 email を画面に出さないのは意図的な設計:
 * better-auth の getInvitation は不一致セッションに対し invitation.email を漏らさず
 * 403 を返す (recipient enumeration 防止)。UI もそれに揃え、「招待されたアドレス」と
 * ぼかして案内する。
 */
export function InvitationMismatch() {
  const [loading, setLoading] = useState(false);

  const handleSignOut = async () => {
    setLoading(true);
    try {
      await authClient.signOut();
      // signOut 後は招待リンクを再度開かせたいので、現在 URL を保持したまま reload。
      // /sign-in 直送りだと招待 id を失う動線が出来てしまう。
      window.location.reload();
    } catch (e) {
      console.error("[invitation-mismatch] signOut failed:", e);
      toast.error("ログアウトに失敗しました。時間を置いて再度お試しください。");
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>別のアカウントでログイン中です</CardTitle>
          <CardDescription>
            この招待は、現在ログイン中のアカウントとは異なるメールアドレス宛に送信されています。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert>
            <AlertTriangleIcon className="size-4" />
            <AlertDescription>
              招待を受けるには、一度ログアウトしてから、招待メールが届いたメールアドレスでログインまたは新規登録し直してください。
              そのあと再度この招待リンクを開いてください。
            </AlertDescription>
          </Alert>
        </CardContent>
        <CardFooter>
          <Button onClick={handleSignOut} disabled={loading} className="w-full">
            {loading ? "ログアウト中..." : "ログアウトして入り直す"}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
