"use client";

import { Separator } from "@liveboard/ui/components/ui/separator";
import { Skeleton } from "@liveboard/ui/components/ui/skeleton";
import { useAuth } from "@/components/auth-provider";
import type { LinkedAccount } from "../../_lib/types";
import { DeleteAccountSection } from "./_features/delete-account-section";
import { PasswordForm } from "./_features/password-form";
import { ProfileForm } from "./_features/profile-form";
import { SignInMethodsSection } from "./_features/sign-in-methods-section";

type Props = {
  /** Better Auth `listAccounts()` の結果。fetch 完了前は null。 */
  accounts: LinkedAccount[] | null;
  /** listAccounts を再取得する callback (unlink 後の反映用)。 */
  onRefresh: () => void | Promise<void>;
  /** ログイン方法取得に失敗したときのエラー文言。null = 正常。 */
  errorMessage: string | null;
};

/**
 * 個人スコープのアカウント設定ページ。
 *
 * セクション構成:
 *   1. プロフィール     — 名前
 *   2. ログイン方法    — メール/PW 状態 + Google linkSocial / unlinkAccount
 *   3. セキュリティ    — パスワード変更
 *   4. 危険な操作      — アカウント削除
 *
 * 「設定」セクション側にあった `/dashboard/settings/account` (ログイン方法専用ページ) は
 * このページに統合済み (旧URLは page 自体を削除)。
 * テーマ (light/dark) のトグルは PageHeader 右端に移設済み。
 */
export function AccountView({ accounts, onRefresh, errorMessage }: Props) {
  const { session } = useAuth();

  if (!session) {
    return null;
  }

  return (
    <div className="max-w-lg space-y-8">
      <section className="space-y-4">
        <h2 className="font-semibold text-lg">プロフィール</h2>
        <ProfileForm key={session.user.id} currentName={session.user.name} />
      </section>

      <Separator />

      <section className="space-y-4">
        <h2 className="font-semibold text-lg">ログイン方法</h2>
        {errorMessage ? (
          <p className="text-destructive text-sm">{errorMessage}</p>
        ) : accounts === null ? (
          <SignInMethodsSkeleton />
        ) : (
          <SignInMethodsSection accounts={accounts} onRefresh={onRefresh} />
        )}
      </section>

      <Separator />

      <section className="space-y-4">
        <h2 className="font-semibold text-lg">パスワード</h2>
        <PasswordForm />
      </section>

      <Separator />

      <section className="space-y-4">
        <h2 className="font-semibold text-destructive text-lg">危険な操作</h2>
        <DeleteAccountSection userName={session.user.name} />
      </section>
    </div>
  );
}

function SignInMethodsSkeleton() {
  return (
    <div className="space-y-4">
      {/* email/password row */}
      <div className="flex items-center justify-between gap-3 rounded-md border p-3">
        <div className="flex items-center gap-3">
          <Skeleton className="size-5 rounded" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-3 w-16" />
          </div>
        </div>
        <Skeleton className="size-5 rounded-full" />
      </div>
      {/* google row */}
      <div className="flex items-center justify-between gap-3 rounded-md border p-3">
        <div className="flex items-center gap-3">
          <Skeleton className="size-5 rounded" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-3 w-20" />
          </div>
        </div>
        <Skeleton className="h-8 w-24" />
      </div>
    </div>
  );
}
