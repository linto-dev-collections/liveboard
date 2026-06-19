"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { authClient } from "@/lib/auth-client";
import {
  type VerifyEmailStatus,
  VerifyEmailView,
} from "../_features/verify-email-view";

type Props = {
  /**
   * URL クエリの `?token=...` を server 側で抽出して props 渡し。
   * undefined ならクライアント側で `invalid` 扱いに分岐する。
   */
  token: string | undefined;
};

/**
 * メールアドレス確認 Container。
 *
 * directory-rules 例外メモ:
 *   Better Auth の `authClient.verifyEmail()` は browser 専用 SDK
 *   (`createAuthClient` の戻り値) であり、Server Component から呼べる
 *   helper を `lib/auth-server-client.ts` で公開していないため、container
 *   をクライアントコンポーネントにする。account-container.tsx と同じパターン。
 *   View 側 (`verify-email-view/index.tsx`) は status props のみで動作する
 *   pure presentational とすることで、責務分離を保つ。
 */
export function VerifyEmailContainer({ token }: Props) {
  const router = useRouter();
  const [status, setStatus] = useState<VerifyEmailStatus>(
    token === undefined ? "invalid" : "verifying",
  );
  const calledRef = useRef(false);

  useEffect(() => {
    if (calledRef.current) return;
    calledRef.current = true;

    if (token === undefined) {
      // 既に "invalid" で初期化されているので何もしない
      return;
    }

    (async () => {
      try {
        // 他ユーザー（特に削除済ユーザー）の stale な session_token / session_data cookie を
        // 必ず expire させてから verifyEmail を叩く。残ったままだと better-auth は cookieCache
        // (60s TTL) 経由で「email 一致」を理由に削除済 user_id の session を流用し、続く
        // organization 紐付けで member.user_id の FK が破綻する。signOut は cookie が
        // 無くても 200 を返し Set-Cookie expiration を発行するので無害。
        await authClient.signOut().catch(() => {});

        const { error } = await authClient.verifyEmail({
          query: { token },
        });

        if (error) {
          setStatus("error");
          return;
        }

        setStatus("success");

        // organization の作成 + activeOrganizationId の設定はサーバー側
        // `@liveboard/auth` の databaseHooks.user.create.after / session.create.before
        // に集約済み (Google 認証 Phase 2)。verify-email 経路でも email/password
        // 経路でも同じフックを通るため、ここでは redirect するだけで OK。
        router.push("/dashboard");
      } catch {
        setStatus("error");
      }
    })();
  }, [token, router]);

  return <VerifyEmailView status={status} />;
}
