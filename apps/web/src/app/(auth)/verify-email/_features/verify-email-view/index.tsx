"use client";

import { Button } from "@liveboard/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@liveboard/ui/components/ui/card";
import { CheckCircle2Icon, Loader2Icon, XCircleIcon } from "lucide-react";
import Link from "next/link";

export type VerifyEmailStatus = "verifying" | "success" | "error" | "invalid";

type Props = {
  status: VerifyEmailStatus;
};

/**
 * メールアドレス確認の表示専用 View。
 * status props を switch して 4 通りの UI を描画する。
 * fetch / 副作用は一切持たない。
 */
export function VerifyEmailView({ status }: Props) {
  return (
    <Card className="w-full max-w-md">
      <CardHeader className="items-center justify-items-center text-center">
        {status === "verifying" && (
          <>
            <Loader2Icon className="mx-auto mb-2 size-10 animate-spin text-primary" />
            <CardTitle className="text-2xl">
              メールアドレスを確認しています...
            </CardTitle>
          </>
        )}
        {status === "success" && (
          <>
            <CheckCircle2Icon className="mx-auto mb-2 size-10 text-success" />
            <CardTitle className="text-2xl">
              メールアドレスが確認されました
            </CardTitle>
          </>
        )}
        {status === "error" && (
          <>
            <XCircleIcon className="mx-auto mb-2 size-10 text-destructive" />
            <CardTitle className="text-2xl">
              確認リンクが無効または期限切れです
            </CardTitle>
          </>
        )}
        {status === "invalid" && (
          <>
            <XCircleIcon className="mx-auto mb-2 size-10 text-destructive" />
            <CardTitle className="text-2xl">無効なリンクです</CardTitle>
          </>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        {status === "success" && (
          <p className="text-center text-muted-foreground text-sm">
            ダッシュボードに移動しています...
          </p>
        )}

        {(status === "error" || status === "invalid") && (
          <div className="flex flex-col gap-2">
            <Button className="w-full" render={<Link href="/check-email" />}>
              確認メールを再送する
            </Button>
            <div className="text-center">
              <Link
                href="/sign-in"
                className="text-muted-foreground text-sm underline-offset-4 hover:underline"
              >
                ログインページに戻る
              </Link>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
