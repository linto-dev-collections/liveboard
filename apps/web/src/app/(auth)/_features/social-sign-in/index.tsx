"use client";

import { env } from "@liveboard/env/web";
import { Badge } from "@liveboard/ui/components/ui/badge";
import { Button } from "@liveboard/ui/components/ui/button";
import { Separator } from "@liveboard/ui/components/ui/separator";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { GoogleLogo } from "@/components/google-logo";
import { authClient } from "@/lib/auth-client";

/**
 * sign-in / sign-up 共通のソーシャルログインブロック。
 *
 * - 上部に「Google で続行」ボタン (白背景 + Google ブランド準拠 G ロゴ)
 * - 下部に "または" の区切り (区切り線 + テキスト + 区切り線)
 *
 * セキュリティ:
 *   - callbackURL は `safeInternalPath` で internal path に強制 (open redirect 防止)
 *   - errorCallbackURL は固定 `/account-not-linked` (外部入力なし)
 *   - Button は `type="button"` で sign-in フォーム内で Enter キー誤発火しないようにする
 *
 * Better Auth callback の origin に関する注意 (1.6.9 検証):
 *   `c.body.callbackURL` / `c.body.errorCallbackURL` は state 経由でそのまま保存され、
 *   OAuth callback 完了後の `c.redirect(callbackURL)` で **相対パスは API origin
 *   (BETTER_AUTH_URL = api.liveboard.app / 3000.mydevbox.pp.ua) 基準** で resolve される。
 *   → web 側 (NEXT_PUBLIC_APP_URL) にユーザーを戻すには、**絶対 URL** を渡す必要がある。
 *   ref: better-auth/dist/oauth2/state.mjs (`callbackURL = c.body?.callbackURL || baseURL`)
 *       better-auth/dist/api/routes/callback.mjs (`c.redirect(toRedirectTo)`)
 *
 * UX:
 *   - disabled 中はテキストを "リダイレクト中..." に切り替えてフィードバックを返す
 *   - signIn.social は同一タブで accounts.google.com に飛ぶため、catch に来るのは
 *     最初の POST 失敗 (= サーバー側 5xx 等) のみ。その場合 sonner で通知する。
 */

function safeInternalPath(url: string | undefined): string {
  // ・url が無い: デフォルトに倒す
  // ・"/" で始まらない: 外部 URL 扱い → デフォルト
  // ・"//evil.com" のような protocol-relative URL: 外部扱い → デフォルト
  if (!url?.startsWith("/") || url.startsWith("//")) return "/dashboard";
  return url;
}

/** `safeInternalPath` 済みのパスを web origin と結合して絶対 URL にする。 */
function toAbsoluteWebUrl(internalPath: string): string {
  // env.NEXT_PUBLIC_APP_URL は zod (z.url()) で valid URL に強制されているため、
  // 末尾スラッシュ無しの origin が入る前提。internalPath は "/" 始まり。
  return `${env.NEXT_PUBLIC_APP_URL}${internalPath}`;
}

type Props = {
  callbackUrl?: string;
  /** sign-in / sign-up のどちらから来たか。アクセシビリティラベルだけ調整。 */
  context: "sign-in" | "sign-up";
};

export function SocialSignIn({ callbackUrl, context }: Props) {
  const [isPending, setIsPending] = useState(false);
  // 直前のログイン方法ヒント。Cookie は document が無い SSR 時は null になるため、
  // mount 後にだけ state を埋めて hydration mismatch を避ける。
  // sign-in 文脈でのみ表示する (sign-up で「あなたは Google で登録済」と暗示すると
  // 既存の `onExistingUserSignUp` で意図的に generic にしている文言と矛盾するため)。
  const [showLastUsedBadge, setShowLastUsedBadge] = useState(false);
  useEffect(() => {
    if (context !== "sign-in") return;
    setShowLastUsedBadge(authClient.getLastUsedLoginMethod() === "google");
  }, [context]);

  return (
    <div className="mb-4 space-y-4">
      <Button
        type="button"
        variant="outline"
        className="relative w-full gap-2 bg-muted/40 text-foreground hover:bg-muted/60"
        disabled={isPending}
        aria-label={
          context === "sign-in"
            ? "Google アカウントでログイン"
            : "Google アカウントで新規登録"
        }
        onClick={async () => {
          setIsPending(true);
          try {
            await authClient.signIn.social({
              provider: "google",
              // 絶対 URL で web origin に戻す。相対パスだと API origin に飛んでしまう
              // (Better Auth 1.6.9 の callback handler が baseURL=BETTER_AUTH_URL で resolve するため)。
              callbackURL: toAbsoluteWebUrl(safeInternalPath(callbackUrl)),
              // ACCOUNT_NOT_LINKED など link 不可エラーが発生したらこちらに飛ばす。
              // クエリは付けない (user enumeration 防止 / 端末肩越し情報漏洩防止)。
              errorCallbackURL: toAbsoluteWebUrl("/account-not-linked"),
            });
            // signIn.social は同一タブで accounts.google.com にリダイレクトするため、
            // 通常ここに到達しない (page unmount される)。
          } catch (err) {
            console.error("[social-sign-in] failed:", err);
            toast.error(
              "Google ログインを開始できませんでした。時間を置いて再度お試しください。",
            );
            setIsPending(false);
          }
        }}
      >
        <GoogleLogo className="size-4" />
        <span>{isPending ? "リダイレクト中..." : "Google で続行"}</span>
        {showLastUsedBadge && (
          // ラベルを中央に保つため絶対配置で右上に固定。
          // pointer-events-none で Button のクリックを邪魔しないようにする。
          <Badge
            variant="secondary"
            className="pointer-events-none absolute top-0 right-2 -translate-y-1/2"
          >
            前回利用
          </Badge>
        )}
      </Button>

      <div className="flex items-center gap-3">
        <Separator className="flex-1" />
        <span className="text-muted-foreground text-xs">または</span>
        <Separator className="flex-1" />
      </div>
    </div>
  );
}
