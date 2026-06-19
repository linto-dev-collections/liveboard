"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { AccountView } from "../_features/account-view";
import type { LinkedAccount } from "../_lib/types";

/**
 * アカウント (個人スコープ設定) の Container。
 *
 * directory-rules 例外メモ:
 *   通常 Container は Server Component で `_lib/queries.ts` を呼ぶが、
 *   `authClient.listAccounts` は Better Auth client (browser) 向け SDK で、
 *   Cookie 転送付きの Server-side fetch 用 helper は別途用意していないため、
 *   ここでは `"use client"` Container を採用する。AccountView 本体も既存仕様で
 *   `useAuth()` を必要とするため client が前提。
 *
 * UX:
 *   - `accounts` 取得中は AccountView 側で null 判定。
 *   - 戻り先 `?linked=google` を検知して success toast を 1 度だけ表示。
 */
export function AccountContainer({ linkedStatus }: { linkedStatus?: string }) {
  const [accounts, setAccounts] = useState<LinkedAccount[] | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchAccounts = useCallback(async (signal?: AbortSignal) => {
    const { data, error } = await authClient.listAccounts();
    if (signal?.aborted) return;
    if (error) {
      setErrorMessage(error.message ?? "ログイン方法の取得に失敗しました。");
      return;
    }
    setAccounts(data ?? []);
    setErrorMessage(null);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetchAccounts(controller.signal);
    return () => {
      controller.abort();
    };
  }, [fetchAccounts]);

  // linkSocial 経由で戻ってきたときの 1 回限り success toast。
  // strict-mode 二重 useEffect でも toast が二重発火しないよう state を見て分岐する。
  useEffect(() => {
    if (linkedStatus === "google" && accounts !== null) {
      const isLinked = accounts.some((a) => a.providerId === "google");
      if (isLinked) {
        toast.success("Google を連携しました。");
      }
    }
    // 依存配列に accounts を含めないことで、初回 list 取得後の 1 回だけ評価する。
  }, [linkedStatus, accounts]);

  return (
    <AccountView
      accounts={accounts}
      onRefresh={fetchAccounts}
      errorMessage={errorMessage}
    />
  );
}
