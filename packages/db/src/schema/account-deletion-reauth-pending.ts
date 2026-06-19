import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { user } from "./auth";

/**
 * OAuth 専用ユーザー (password を持たないユーザー) の
 * アカウント削除に必要な「Google で再認証完了」の証跡を一時保管するテーブル。
 *
 * 流れ:
 *   1. /api/account/delete/initiate-reauth で nonce を発行して INSERT
 *      (prev_session_id = 当時の session.id, organization_actions = snapshot)
 *   2. クライアントが authClient.signIn.social({ prompt: "login" }) で Google 再認証
 *   3. callbackURL = /dashboard/account/confirm-delete?nonce=... に着地
 *   4. /api/account/delete/confirm-reauth が nonce + session.id !== prev_session_id +
 *      session.createdAt > created_at + 未 expires + 未 used を全て検証
 *   5. 検証 OK なら used_at をセットし (single-use)、`account_deletion_pending` への
 *      遷移を含む既存の deletion flow を発火する
 *
 * セキュリティ不変条件:
 *   - nonce は呼び出し側で 32-byte random base64url 生成
 *   - TTL は呼び出し側で +5 分にする (本テーブルは値を強制しない)
 *   - 単一 user は同時に複数 row を持てない: initiate 時に既存 row を DELETE
 *   - confirm 後の row は used_at で消費印を付ける (replay 防止)
 *   - user 行削除に cascade で消える
 */
export const accountDeletionReauthPending = sqliteTable(
  "account_deletion_reauth_pending",
  {
    /** 32-byte random base64url。URL クエリ・DB lookup キー。 */
    nonce: text("nonce").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /**
     * initiate 呼び出し時の session.id。confirm 時に「現在の session.id がこれと
     * 一致したら再認証されていない」と判定するための比較対象。
     */
    prevSessionId: text("prev_session_id").notNull(),
    /**
     * organizationActions JSON snapshot。client が confirm 時に再送することは
     * 許さず、必ず本 column の値を使う (改ざん防止)。
     */
    organizationActions: text("organization_actions", {
      mode: "json",
    })
      .$type<
        Array<
          | {
              organizationId: string;
              action: "transfer";
              transferToUserId: string;
            }
          | { organizationId: string; action: "delete-org" }
        >
      >()
      .notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    /** NULL=未使用、!=NULL=消費済 (replay 防止)。 */
    usedAt: integer("used_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    index("account_deletion_reauth_pending_userId_idx").on(table.userId),
    index("account_deletion_reauth_pending_expiresAt_idx").on(table.expiresAt),
  ],
);
