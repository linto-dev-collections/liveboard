import { Button } from "@liveboard/ui/components/ui/button";
import { LogOutIcon } from "lucide-react";
import Link from "next/link";

/**
 * Server Component。
 * - `buttonVariants()` は `"use client"` ファイル（button.tsx）からの export なので
 *   Server から呼ぶと「クライアント関数の呼び出し」エラーになる。
 *   代わりに `<Button render={<Link />}>` で base-ui の slot パターンを使う。
 * - base-ui の Button は既定で `nativeButton: true`（<button> 描画前提）。
 *   anchor として描画する場合は `nativeButton={false}` を明示する必要がある
 *   （プロジェクト共通パターン: `customer-portal-link.tsx` 等を参照）。
 */
export function GoodbyeView() {
  return (
    <div className="container mx-auto max-w-md py-20 text-center">
      <LogOutIcon className="mx-auto mb-6 size-12 text-muted-foreground" />
      <h1 className="font-semibold text-2xl">アカウント削除を受け付けました</h1>
      <p className="mt-3 text-muted-foreground">
        liveboard をご利用いただきありがとうございました。
        <br />
        またのご利用をお待ちしております。
      </p>
      <div className="mt-8">
        <Button nativeButton={false} render={<Link href="/sign-up" />}>
          新しくアカウントを作る
        </Button>
      </div>
    </div>
  );
}
