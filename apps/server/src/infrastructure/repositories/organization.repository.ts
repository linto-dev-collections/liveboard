import {
  accountDeletionPending,
  board,
  member,
  organization,
  user,
} from "@liveboard/db/schema";
import { and, asc, eq, isNull, ne, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { OwnershipConflictError } from "../../domain/errors/account-deletion.error";

type OwnedOrgRow = {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  memberCount: number;
};

type OwnerCandidate = {
  userId: string;
  memberId: string;
  name: string;
  email: string;
  role: "admin" | "member";
};

export function createOrganizationRepository(d1: D1Database) {
  const db = drizzle(d1);

  return {
    /** 組織名を取得（見つからない場合は空文字を返す） */
    async findNameById(orgId: string): Promise<string> {
      const row = await db
        .select({ name: organization.name })
        .from(organization)
        .where(eq(organization.id, orgId))
        .get();
      return row?.name ?? "";
    },

    /**
     * 指定ユーザーが指定組織のメンバーかどうかを確認する。
     * org_members 型共有リンクの視聴認可チェックに使用。
     */
    async isMemberOf(userId: string, organizationId: string): Promise<boolean> {
      const row = await db
        .select({ id: member.id })
        .from(member)
        .where(
          and(
            eq(member.userId, userId),
            eq(member.organizationId, organizationId),
          ),
        )
        .get();
      return row !== undefined;
    },

    /**
     * 指定ユーザーが owner として所属する org 一覧 + memberCount。
     * 1 クエリで集約する（GROUP BY org_id + COUNT(member)）。
     */
    async findOwnedByUserId(userId: string): Promise<OwnedOrgRow[]> {
      // owner 行を持つ org を identify。
      const ownedOrgIds = db
        .select({ orgId: member.organizationId })
        .from(member)
        .where(and(eq(member.userId, userId), eq(member.role, "owner")))
        .as("owned_orgs");
      const rows = await db
        .select({
          organizationId: organization.id,
          organizationName: organization.name,
          organizationSlug: organization.slug,
          memberCount: sql<number>`(SELECT COUNT(*) FROM member WHERE member.organization_id = ${organization.id})`,
        })
        .from(organization)
        .innerJoin(ownedOrgIds, eq(ownedOrgIds.orgId, organization.id))
        .all();
      return rows.map((r) => ({
        ...r,
        memberCount: Number(r.memberCount),
      }));
    },

    /**
     * owner 譲渡先候補（自分以外の admin/member）を返す。
     * - user.email_verified = true 必須
     * - account_deletion_pending に行が無い（自分も削除中の user は除外）
     */
    async findOwnerCandidates(
      organizationId: string,
    ): Promise<OwnerCandidate[]> {
      const rows = await db
        .select({
          memberId: member.id,
          userId: member.userId,
          role: member.role,
          name: user.name,
          email: user.email,
        })
        .from(member)
        .innerJoin(
          user,
          and(eq(user.id, member.userId), eq(user.emailVerified, true)),
        )
        .leftJoin(
          accountDeletionPending,
          eq(accountDeletionPending.userId, user.id),
        )
        .where(
          and(
            eq(member.organizationId, organizationId),
            ne(member.role, "owner"),
            isNull(accountDeletionPending.userId),
          ),
        )
        .orderBy(asc(member.role), asc(user.name))
        .all();
      return rows.map((r) => ({
        memberId: r.memberId,
        userId: r.userId,
        name: r.name,
        email: r.email,
        // member.role はテキスト列 (default 'member')。owner はフィルタ済なので残りは admin / member。
        role: r.role === "admin" ? ("admin" as const) : ("member" as const),
      }));
    },

    /**
     * 組織 owner を旧 user → 新 user に atomic に swap する。
     * - 旧 owner の member 行を role='admin' に降格
     * - 新 owner の member 行を role='owner' に昇格
     *
     * 前提条件を SELECT で pre-validate してから demote/promote の 2 UPDATE を
     * `db.batch([...])` で 1 トランザクションとして実行する。間で失敗すると
     * 「owner ゼロ org」が発生するため、必ず batch 化する。
     *
     * pre-validate では「現在の owner がちょうど 1 人 = fromUserId」も assert する。
     * これにより owner 重複（バグで複数 owner 行が生まれた状態）を検知し、
     * 黙って 1 人だけ降格して残りを放置するパターンを防ぐ。
     */
    async swapOwnership(params: {
      organizationId: string;
      fromUserId: string;
      toUserId: string;
    }): Promise<void> {
      // pre-validate: from は owner、to は同 org の admin/member
      const rows = await db
        .select({ userId: member.userId, role: member.role })
        .from(member)
        .where(eq(member.organizationId, params.organizationId))
        .all();
      const owners = rows.filter((r) => r.role === "owner");
      if (owners.length !== 1 || owners[0]?.userId !== params.fromUserId) {
        throw new OwnershipConflictError(
          `organization '${params.organizationId}' must have exactly one owner = ${params.fromUserId} (found ${owners.length} owner(s))`,
        );
      }
      const toRow = rows.find((r) => r.userId === params.toUserId);
      if (!toRow || toRow.role === "owner") {
        throw new OwnershipConflictError(
          `to user is not a valid transfer target in organization '${params.organizationId}'`,
        );
      }

      await db.batch([
        // 旧 owner → admin に降格
        db
          .update(member)
          .set({ role: "admin" })
          .where(
            and(
              eq(member.organizationId, params.organizationId),
              eq(member.userId, params.fromUserId),
            ),
          ),
        // 新 owner → owner に昇格
        db
          .update(member)
          .set({ role: "owner" })
          .where(
            and(
              eq(member.organizationId, params.organizationId),
              eq(member.userId, params.toUserId),
            ),
          ),
      ]);
    },

    /**
     * 1 人 org を組織ごと cascade DELETE する。
     * 他メンバーが居ないことを SELECT で再検証してから DELETE。
     */
    async deleteSoloOrganization(params: {
      organizationId: string;
      userId: string;
    }): Promise<void> {
      const others = await db
        .select({ id: member.id })
        .from(member)
        .where(
          and(
            eq(member.organizationId, params.organizationId),
            ne(member.userId, params.userId),
          ),
        )
        .all();
      if (others.length > 0) {
        throw new OwnershipConflictError(
          `cannot delete organization '${params.organizationId}': ${others.length} other member(s) exist`,
        );
      }
      // org→board は RESTRICT のため、配下ボードを先にハード削除してから org を消す（Phase 6-2）。
      // board DELETE の CASCADE で board_role / board_favorite / comment_thread(→comment→
      // mention/notification) / board_r2_object(→asset) が連動削除される。R2 オブジェクトは
      // manifest 消失で孤児化し、孤児回収 GC（reclaim-orphans）が後追いで掃ける。
      await db
        .delete(board)
        .where(eq(board.organizationId, params.organizationId));
      // organization の DELETE で member / invitation は cascade。
      await db
        .delete(organization)
        .where(eq(organization.id, params.organizationId));
    },

    /** 組織内の owner 数（実装バグ検知用）。 */
    async countOwnerMembers(organizationId: string): Promise<number> {
      const [row] = await db
        .select({ count: sql<number>`count(*)` })
        .from(member)
        .where(
          and(
            eq(member.organizationId, organizationId),
            eq(member.role, "owner"),
          ),
        )
        .all();
      return Number(row?.count ?? 0);
    },
  };
}
