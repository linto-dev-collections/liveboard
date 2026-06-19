"use client";

import { Button } from "@liveboard/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@liveboard/ui/components/ui/card";
import { AlertTriangleIcon, ArrowLeftIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { authClient } from "@/lib/auth-client";

type Props = { nonce: string };

/**
 * Google で再認証完了後にユーザーが到達する最終確認 UI。
 *
 * - nonce が空文字 (= URL クエリ無しで直接 / 戻るボタンで来た等) はエラー表示
 * - 「アカウントを削除する」をクリック → /api/account/delete/confirm-reauth
 * - 成功時: authClient.signOut() で cookie expire → /goodbye
 * - 失敗時: toast でエラー、/dashboard/account へ戻すリンクを残す
 *
 * セキュリティ:
 *   - confirm-reauth の検証はサーバ側 (currentSessionId !== prev_session_id +
 *     currentSession.createdAt > row.createdAt + nonce single-use) で完結する。
 *     UI は単純な POST のラッパに過ぎず、フロント側の判定は無い。
 */
export function ConfirmDeleteView({ nonce }: Props) {
  const [isPending, startTransition] = useTransition();
  const [errored, setErrored] = useState(false);
  const router = useRouter();

  if (!nonce) {
    return (
      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangleIcon className="size-5 text-destructive" />
            リクエストが見つかりません
          </CardTitle>
          <CardDescription>
            アカウント削除のセッションが見つかりませんでした。アカウント画面から再度お試しください。
          </CardDescription>
        </CardHeader>
        <CardFooter>
          <Button variant="outline" render={<Link href="/dashboard/account" />}>
            <ArrowLeftIcon className="mr-2 size-4" />
            アカウント画面に戻る
          </Button>
        </CardFooter>
      </Card>
    );
  }

  const handleConfirm = () => {
    setErrored(false);
    startTransition(async () => {
      const res = await api.api.account["delete-reauth"].confirm.$post({
        json: { nonce },
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        const message =
          body?.error ??
          (res.status === 410
            ? "認証の有効期限が切れました。アカウント画面から再度お試しください。"
            : res.status === 404
              ? "削除リクエストが見つかりません。アカウント画面から再度お試しください。"
              : "アカウント削除に失敗しました");
        toast.error(message);
        setErrored(true);
        return;
      }
      // server で session 全削除済 + 410 middleware が dashboard ルートを封じる。
      // ブラウザ cookie だけはこちらで明示的に expire (詳細は delete-account-dialog.tsx の
      // コメント参照)。
      await authClient.signOut().catch(() => {});
      router.replace("/goodbye" as "/dashboard");
    });
  };

  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle>削除の最終確認</CardTitle>
        <CardDescription>
          Google
          での再認証が完了しました。下のボタンをクリックすると、アカウントと全データの削除が始まります。これは取り消せません。
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground text-sm">
          完了すると自動的にログアウトされ、サインアウト後の画面に遷移します。
        </p>
      </CardContent>
      <CardFooter className="flex flex-wrap gap-2">
        <Button
          variant="destructive"
          onClick={handleConfirm}
          disabled={isPending}
        >
          {isPending ? "削除中..." : "アカウントを削除する"}
        </Button>
        {errored && (
          <Button variant="outline" render={<Link href="/dashboard/account" />}>
            <ArrowLeftIcon className="mr-2 size-4" />
            アカウント画面に戻る
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
