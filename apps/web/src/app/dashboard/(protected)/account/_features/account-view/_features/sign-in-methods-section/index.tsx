"use client";

import { env } from "@liveboard/env/web";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@liveboard/ui/components/ui/alert-dialog";
import { Button } from "@liveboard/ui/components/ui/button";
import { CheckCircle2Icon, MailIcon, ShieldAlertIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { GoogleLogo } from "@/components/google-logo";
import { authClient } from "@/lib/auth-client";
import type { LinkedAccount } from "../../../../_lib/types";

type Props = {
  accounts: LinkedAccount[];
  onRefresh: () => void | Promise<void>;
};

/**
 * ユーザーの「ログイン方法」管理セクション。
 *
 * 表示する provider:
 *   - "credential" (= メールアドレスとパスワード): 表示のみ。set/reset は別 UI で扱う。
 *   - "google": linkSocial / unlinkAccount を行う。
 *
 * セキュリティ:
 *   - linkSocial の callbackURL は internal path 固定 (open redirect 不可)。
 *   - unlinkAccount 前に UI 側でも totalMethods <= 1 を判定し、サーバー側の
 *     `allowUnlinkingAll=false` (Better Auth default) と二重防御。
 *   - AlertDialog で誤操作を必ず経由する (window.confirm ではなくアプリ標準の Dialog)。
 *   - account 行の accessToken/refreshToken/idToken は表示しない (列を参照しない)。
 */
export function SignInMethodsSection({ accounts, onRefresh }: Props) {
  const hasPassword = accounts.some((a) => a.providerId === "credential");
  const googleAccount = accounts.find((a) => a.providerId === "google");
  const totalMethods = (hasPassword ? 1 : 0) + (googleAccount ? 1 : 0);

  const [linking, setLinking] = useState(false);
  const [unlinking, setUnlinking] = useState(false);

  async function handleLinkGoogle() {
    setLinking(true);
    try {
      await authClient.linkSocial({
        provider: "google",
        // 絶対 URL で web origin に戻す。相対パスだと Better Auth callback handler が
        // BETTER_AUTH_URL (API origin) で resolve してしまい、ユーザーが api.* に飛ぶ。
        // (better-auth 1.6.9: oauth2/state.mjs + api/routes/callback.mjs)
        callbackURL: `${env.NEXT_PUBLIC_APP_URL}/dashboard/account?linked=google`,
      });
      // 同一タブで accounts.google.com に飛ぶため通常ここに到達しない (page unmount)。
    } catch (err) {
      console.error("[link-google] failed:", err);
      toast.error(
        "Google の連携に失敗しました。時間を置いて再度お試しください。",
      );
      setLinking(false);
    }
  }

  /**
   * 確認は AlertDialog の AlertDialogAction クリックで担保される。
   * Trigger ボタンは totalMethods <= 1 で disabled にしているため通常 Dialog 自体が
   * 開かないが、二重防御として再判定する。
   */
  async function handleConfirmUnlinkGoogle() {
    if (totalMethods <= 1) {
      toast.error("最後のログイン方法は解除できません。");
      return;
    }
    setUnlinking(true);
    try {
      const { error } = await authClient.unlinkAccount({
        providerId: "google",
      });
      if (error) {
        toast.error(error.message ?? "解除に失敗しました。");
        return;
      }
      // /sign-in の「前回利用」バッジが解除済 Google を指し続けるのを防ぐ。
      //
      // 実体の削除は packages/auth/src/index.ts の hooks.after が
      // `Set-Cookie: ...; Domain=.<COOKIE_DOMAIN>; Max-Age=0` を発行することで
      // 行う (Better Auth 公式 client の `clearLastUsedLoginMethod` は Domain
      // 属性を付けない host-only deletion のため、本番/dev の domain-scoped
      // cookie を消せない)。
      //
      // ここで client 側も呼んでおくのは、COOKIE_DOMAIN 未設定環境 (ローカル
      // localhost 等で host-only cookie になっているケース) での補助的な後始末
      // 兼、`authClient` の内部キャッシュが将来追加された場合の備え。
      //
      // 「最後 email でログイン → 後から Google を連携 → Google を解除」の動線では
      // cookie が "email" のまま残っているため、ここで消すと email 側「前回利用」
      // バッジまで失われてしまう。現値が "google" の時だけクリアする。
      if (authClient.getLastUsedLoginMethod() === "google") {
        authClient.clearLastUsedLoginMethod();
      }
      toast.success("Google の連携を解除しました。");
      await onRefresh();
    } finally {
      setUnlinking(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* email/password */}
      <div className="flex items-center justify-between gap-3 rounded-md border p-3">
        <div className="flex min-w-0 items-center gap-3">
          <MailIcon className="size-5 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <p className="font-medium text-sm">メールアドレスとパスワード</p>
            <p className="text-muted-foreground text-xs">
              {hasPassword ? "有効" : "未設定"}
            </p>
          </div>
        </div>
        {hasPassword && (
          <CheckCircle2Icon
            className="size-5 shrink-0 text-success"
            aria-label="有効"
          />
        )}
      </div>

      {/* Google */}
      <div className="flex items-center justify-between gap-3 rounded-md border p-3">
        <div className="flex min-w-0 items-center gap-3">
          <GoogleLogo className="size-5 shrink-0" />
          <div className="min-w-0">
            <p className="font-medium text-sm">Google</p>
            <p className="text-muted-foreground text-xs">
              {googleAccount ? "連携済み" : "未連携"}
            </p>
          </div>
        </div>
        {googleAccount ? (
          <AlertDialog>
            <AlertDialogTrigger
              render={
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={unlinking || totalMethods <= 1}
                  title={
                    totalMethods <= 1
                      ? "最後のログイン方法は解除できません"
                      : undefined
                  }
                />
              }
            >
              {unlinking ? "解除中..." : "解除"}
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  Google との連携を解除しますか?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  解除後は Google
                  ボタンでログインできなくなります。再度ご利用いただくには再連携が必要です。
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>キャンセル</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleConfirmUnlinkGoogle}
                  variant="destructive"
                >
                  解除する
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : (
          <Button
            type="button"
            size="sm"
            onClick={handleLinkGoogle}
            disabled={linking}
          >
            {linking ? "リダイレクト中..." : "Google を連携"}
          </Button>
        )}
      </div>

      {/* セキュリティガイダンス */}
      {totalMethods >= 2 && (
        <p className="flex items-start gap-2 text-muted-foreground text-xs leading-relaxed">
          <ShieldAlertIcon className="mt-0.5 size-3.5 shrink-0" />
          <span>
            複数のログイン方法を連携しておくと、いずれかでログインできなくなったときも
            アカウントにアクセスできます。
          </span>
        </p>
      )}
    </div>
  );
}
