import { db } from "@liveboard/db";
import { member, organization } from "@liveboard/db/schema/auth";
import { createId } from "@paralleldrive/cuid2";
import { asc, eq } from "drizzle-orm";

/**
 * 新規 user に対して個人ワークスペース (= personal organization) を 1 つ作成し、
 * owner ロールの member 行を紐付ける。
 *
 * Better Auth の `databaseHooks.user.create.after` から呼び出される。
 * email/password・Google・linkSocial の全経路で「session 確立前」にこの関数が走るため、
 * 続く API リクエストで `activeOrganizationId` を必ず引き当てられる状態にできる
 * (= verify-email ページ CSR で起きていた race の根絶)。
 *
 * D1 (SQLite over Cloudflare Workers) には interactive transaction が無いので、
 * organization 行 → member 行の順に逐次 insert する。
 * 部分失敗 (organization 成功 / member 失敗) のときは「孤立 organization 行」が残るが、
 * data corruption (member.user_id FK 不整合等) は発生しない。再 sign-up は
 * 別 slug で新しい organization を作るため運用上の問題にはならない。
 */
export async function bootstrapPersonalOrganization(userId: string): Promise<{
  organizationId: string;
}> {
  const organizationId = createId();
  // slug 衝突防止: crypto.randomUUID は Workers でも利用可能。slice(0, 8) で 32bit のエントロピー。
  // organization.slug の UNIQUE 制約に違反した場合は drizzle が throw → after フック側の
  // try/catch で warn 落ちする。再 sign-up すれば新 UUID で再試行されるので長期的な問題はない。
  const slug = `personal-${crypto.randomUUID().slice(0, 8)}`;
  const now = new Date();

  await db.insert(organization).values({
    id: organizationId,
    name: "マイワークスペース",
    slug,
    createdAt: now,
  });

  await db.insert(member).values({
    id: createId(),
    organizationId,
    userId,
    role: "owner",
    createdAt: now,
  });

  return { organizationId };
}

/**
 * ユーザーが所属する `member` 行のうち最も古い organization の ID を返す。
 *
 * Better Auth の `databaseHooks.session.create.before` から呼び出され、
 * session 行が DB に書かれる直前に `activeOrganizationId` を埋める。
 *
 * - 新規サインアップ直後: 上記 `bootstrapPersonalOrganization` で作られた
 *   personal organization が 1 行だけあるのでそれが返る。
 * - 既存ユーザー再ログイン: 加入順で最古の organization (= 個人ワークスペース) が返る。
 * - member 行が 1 つも無い (=何らかの理由で bootstrap が失敗) 場合は undefined を返し、
 *   後段のフックが `activeOrganizationId` を未設定のまま session を作る。
 *   /dashboard 側のフォールバック (sign-in-form の onSuccess) で救済される。
 */
export async function getOldestOrganizationIdForUser(
  userId: string,
): Promise<string | undefined> {
  const row = await db
    .select({ organizationId: member.organizationId })
    .from(member)
    .where(eq(member.userId, userId))
    .orderBy(asc(member.createdAt))
    .limit(1)
    .get();
  return row?.organizationId;
}
