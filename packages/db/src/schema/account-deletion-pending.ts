import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { user } from "./auth";

/**
 * アカウント削除中ユーザーの追跡テーブル。
 *
 * - INSERT: /api/account/delete で status='processing' + organizationActions snapshot を upsert
 * - UPDATE: 部分失敗で 'failed'
 * - DELETE: 削除完了時に user 行 DELETE → cascade でこの行も消える
 *
 * middleware は `WHERE user_id = ? AND status IN ('processing', 'failed')` で 410 を返す。
 *
 * 削除は同期的に完了するため通常 'processing' 行は瞬時に消えるが、部分失敗時の
 * 再登録ガードとして 'failed' を残す。
 */
export const accountDeletionPending = sqliteTable(
  "account_deletion_pending",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => user.id, { onDelete: "cascade" }),
    requestedAt: integer("requested_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    /**
     * Owner 削除フローのスナップショット。
     * request 時に確定し、confirm 時の整合性チェック（race ガード）に使う。
     */
    metadata: text("metadata", { mode: "json" }).$type<{
      organizationActions: Array<
        | {
            organizationId: string;
            action: "transfer";
            transferToUserId: string;
          }
        | { organizationId: string; action: "delete-org" }
      >;
    }>(),
    status: text("status", { enum: ["processing", "failed"] })
      .default("processing")
      .notNull(),
    lastErrorMessage: text("last_error_message"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("account_deletion_pending_status_idx").on(table.status)],
);
