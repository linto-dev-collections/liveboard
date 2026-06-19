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
import { Input } from "@liveboard/ui/components/ui/input";
import { Label } from "@liveboard/ui/components/ui/label";
import { Skeleton } from "@liveboard/ui/components/ui/skeleton";
import { Trash2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { GoogleLogo } from "@/components/google-logo";
import { authClient } from "@/lib/auth-client";
import { OrgActionsStep } from "../../_components/org-actions-step";
import {
  deleteAccount,
  fetchDeletionPrerequisites,
  initiateReauth,
} from "../../_lib/actions";
import type {
  OrganizationAction,
  OwnedOrganizationSummary,
} from "../../_lib/types";

type Props = { userName: string };
type Step = "loading" | "actions" | "credentials";

const REQUIRED_TEXT = "削除します";

/** ログイン方式: 「password を持つか」を delete dialog の挙動分岐に使う。 */
type AuthMode = "loading" | "password" | "oauth-only";

export function DeleteAccountDialog({ userName }: Props) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("loading");
  const [authMode, setAuthMode] = useState<AuthMode>("loading");
  const [ownedOrgs, setOwnedOrgs] = useState<OwnedOrganizationSummary[]>([]);
  const [actions, setActions] = useState<Map<string, OrganizationAction>>(
    new Map(),
  );
  const [password, setPassword] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const isConfirmTextOk = confirmText === REQUIRED_TEXT;
  const canSubmitPassword = password.length > 0 && isConfirmTextOk;
  const canSubmitOAuth = isConfirmTextOk;
  const hasStuck = ownedOrgs.some(
    (o) => o.memberCount > 1 && o.candidates.length === 0,
  );
  const allOrgsHandled =
    !hasStuck && ownedOrgs.every((o) => actions.has(o.organizationId));

  useEffect(() => {
    if (!open) return;
    setStep("loading");
    setAuthMode("loading");
    setActions(new Map());
    setPassword("");
    setConfirmText("");
    const ac = new AbortController();
    void (async () => {
      // 1. 並行で「削除前提条件」と「ログイン方法一覧」を取得
      const [prereqResult, accountsResult] = await Promise.all([
        fetchDeletionPrerequisites(),
        authClient.listAccounts({ fetchOptions: { signal: ac.signal } }),
      ]);
      if (ac.signal.aborted) return;
      if (!prereqResult.success) {
        toast.error(prereqResult.error);
        setOpen(false);
        return;
      }
      // listAccounts は { data, error } を返す。error 時は安全側に倒して
      // password 経路に振る (誤って OAuth 経路を開けてしまうより、UX が止まるだけの方が安全)。
      const accountsData = accountsResult?.data;
      const hasPassword = Array.isArray(accountsData)
        ? accountsData.some(
            (a: { providerId: string }) => a.providerId === "credential",
          )
        : true;
      setAuthMode(hasPassword ? "password" : "oauth-only");
      setOwnedOrgs(prereqResult.data.ownedOrganizations);
      setStep(
        prereqResult.data.ownedOrganizations.length === 0
          ? "credentials"
          : "actions",
      );
    })();
    return () => ac.abort();
  }, [open]);

  const handleNextFromActions = () => {
    if (!allOrgsHandled) return;
    setStep("credentials");
  };

  const handleSubmitPassword = () => {
    startTransition(async () => {
      const orgActions = Array.from(actions.values());
      const result = await deleteAccount({
        password,
        organizationActions: orgActions,
      });
      if (!result.success) {
        toast.error(result.error || "アカウント削除に失敗しました");
        if (result.ownershipConflict) {
          setOpen(false);
        }
        return;
      }
      // server 側で session 全削除済 + status='processing' 遷移済。
      // 以降の dashboard ルートは middleware で 410。/goodbye のみ閲覧可能。
      // 詳細は handleSubmitOAuth と同じ理由で authClient.signOut を呼ぶ。
      await authClient.signOut().catch(() => {});
      router.replace("/goodbye" as "/dashboard");
    });
  };

  /**
   * OAuth 専用ユーザー向け: initiate-reauth を呼んで nonce を受け取り、
   * Google で強制再ログイン (prompt=login) させて /dashboard/account/confirm-delete に
   * 戻す。
   *
   * 実装メモ:
   *   - Better Auth (1.6.9) は `prompt` を **provider 設定値** としてしか受け取らない
   *     (signIn.social の引数には無い)。Phase 3 のサインインでは prompt=select_account
   *     を採用しており、ここだけ "login" にしたいので `disableRedirect: true` で
   *     authorize URL を取り出し、`prompt` クエリを `login` に上書きしてから手動で
   *     遷移する (URL.searchParams.set は同名キーを置換)。
   *   - callbackURL は web origin の絶対 URL を必須とする (Better Auth callback handler
   *     は BETTER_AUTH_URL 基準で相対 URL を resolve するため、相対では API origin に着地)。
   */
  const handleSubmitOAuth = () => {
    startTransition(async () => {
      const orgActions = Array.from(actions.values());
      const result = await initiateReauth({ organizationActions: orgActions });
      if (!result.success) {
        toast.error(result.error || "アカウント削除を開始できませんでした");
        if (result.ownershipConflict) {
          setOpen(false);
        }
        return;
      }
      const callbackUrl = new URL(
        "/dashboard/account/confirm-delete",
        env.NEXT_PUBLIC_APP_URL,
      );
      callbackUrl.searchParams.set("nonce", result.data.nonce);
      try {
        const signInResult = await authClient.signIn.social({
          provider: "google",
          callbackURL: callbackUrl.toString(),
          // Google 側で account linking 等のエラーが起きた場合の戻り先。
          errorCallbackURL: `${env.NEXT_PUBLIC_APP_URL}/account-not-linked`,
          // 自動遷移を抑止して URL を一旦受け取り、prompt=login を上書きしてから遷移。
          disableRedirect: true,
        });
        const authorizeUrl = signInResult?.data?.url;
        if (signInResult?.error || !authorizeUrl) {
          throw new Error(
            signInResult?.error?.message ?? "authorize URL not returned",
          );
        }
        const reauthUrl = new URL(authorizeUrl);
        reauthUrl.searchParams.set("prompt", "login");
        window.location.href = reauthUrl.toString();
      } catch (err) {
        console.error(
          "[delete-account] initiate-reauth signIn.social failed:",
          err,
        );
        toast.error("Google ログイン画面に遷移できませんでした");
      }
    });
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger render={<Button variant="destructive" size="sm" />}>
        <Trash2Icon className="mr-2 size-4" />
        アカウントを削除
      </AlertDialogTrigger>
      <AlertDialogContent className="max-w-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle>
            {step === "actions"
              ? "オーナーを務める組織の対応"
              : "アカウントを削除しますか？"}
          </AlertDialogTitle>
          <AlertDialogDescription
            render={<div className="space-y-2 text-left" />}
          >
            {step === "actions" && (
              <span>
                {userName}{" "}
                さんはオーナーとして所属している組織があります。各組織について、オーナーを別のメンバーへ譲渡するか、組織ごと削除するかを選んでください。
              </span>
            )}
            {step === "credentials" && (
              <span className="block">
                {userName}{" "}
                さんのアカウントを削除します。これは取り消せません。実行するとすぐに全データの削除が始まり、ログアウトされます。
              </span>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {step === "loading" && (
          <div className="space-y-3 py-6">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        )}

        {step === "actions" && (
          <OrgActionsStep
            ownedOrgs={ownedOrgs}
            actions={actions}
            onChange={setActions}
          />
        )}

        {step === "credentials" && authMode === "password" && (
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="delete-password">ログイン時のパスワード</Label>
              <Input
                id="delete-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isPending}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="delete-confirm">
                確認のため{" "}
                <code className="rounded bg-muted px-1 py-0.5 text-xs">
                  {REQUIRED_TEXT}
                </code>{" "}
                と入力
              </Label>
              <Input
                id="delete-confirm"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                disabled={isPending}
              />
            </div>
          </div>
        )}

        {step === "credentials" && authMode === "oauth-only" && (
          <div className="space-y-3 py-2">
            <p className="text-muted-foreground text-sm">
              このアカウントは Google でログインしています。安全のため、削除前に
              Google で再認証を行います。
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="delete-confirm">
                確認のため{" "}
                <code className="rounded bg-muted px-1 py-0.5 text-xs">
                  {REQUIRED_TEXT}
                </code>{" "}
                と入力
              </Label>
              <Input
                id="delete-confirm"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                disabled={isPending}
              />
            </div>
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>キャンセル</AlertDialogCancel>
          {step === "actions" && (
            <Button
              variant="default"
              onClick={handleNextFromActions}
              disabled={!allOrgsHandled}
            >
              次へ
            </Button>
          )}
          {step === "credentials" && authMode === "password" && (
            <AlertDialogAction
              variant="destructive"
              onClick={handleSubmitPassword}
              disabled={!canSubmitPassword || isPending}
            >
              {isPending ? "削除中..." : "アカウントを削除する"}
            </AlertDialogAction>
          )}
          {step === "credentials" && authMode === "oauth-only" && (
            <Button
              variant="destructive"
              onClick={handleSubmitOAuth}
              disabled={!canSubmitOAuth || isPending}
            >
              <GoogleLogo className="mr-2 size-4" />
              {isPending ? "リダイレクト中..." : "Google で認証して削除"}
            </Button>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
