import { invitation, member, user } from "@liveboard/db/schema";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";

/**
 * 退会（アカウント削除）の同期パージ用リポジトリ。
 *
 * 録画・課金・Webhook など外部リソースを持たないため、削除対象は
 *   member / invitation / session / account / user
 * のみ。`user` 行を DELETE すれば FK の `onDelete: cascade` で
 *   session, account, member, invitation(inviter_id),
 *   account_deletion_pending, account_deletion_reauth_pending
 * が連動削除される。
 *
 * ただし `invitation.email` は `user.id` への FK を持たないため cascade されない。
 * 「同じ email で再登録した別人」が過去の招待を承諾できてしまう privacy リスクを
 * 避けるため、user 行 DELETE の前に明示削除する。
 */
export function createAccountPurgeRepository(d1: D1Database) {
  const db = drizzle(d1);

  return {
    /** 退会ユーザー宛の pending 招待を email で削除する（cascade されないため明示）。 */
    async deletePendingInvitationsByEmail(email: string): Promise<void> {
      await db
        .delete(invitation)
        .where(
          and(eq(invitation.email, email), eq(invitation.status, "pending")),
        );
    },

    /**
     * user 行を DELETE する。FK cascade で session / account / member /
     * invitation(inviter) / account_deletion_pending /
     * account_deletion_reauth_pending が連動削除される。
     */
    async deleteUserCascade(userId: string): Promise<void> {
      // member は admin/member ロールのみ残っている想定（owner は同期段階で swap or org delete 済）。
      // cascade に任せても良いが、明示削除して意図を残す。
      await db.delete(member).where(eq(member.userId, userId));
      await db.delete(user).where(eq(user.id, userId));
    },
  };
}
