import { z } from "zod";

/**
 * コメント・メンション・通知 API の入力スキーマ（route 層で使用する共有スキーマ）。
 *
 * - web（fetch クライアント）と server（route validator）の双方で使う。
 * - anchor 整合（element ⇔ point）は DB の CHECK（comment_thread_anchor_check）と
 *   **二重防御**で zod 側でも検証する。
 */

/** 本文の長さ上限（要件 §3.4・DB へ流す前の DoS 抑止）。 */
const bodySchema = z.string().trim().min(1).max(5000);

/** メンション対象 userId 群（重複・件数上限を抑止。非メンバーは原子的 INSERT で無視される）。 */
const mentionedUserIdsSchema = z
  .array(z.string().min(1).max(255))
  .max(50)
  .optional();

/**
 * スレッド作成（最初のコメント込み）。
 * anchor は element（要素追従）か point（座標固定）のいずれか。
 *   - element: anchorElementId 必須・anchorX/Y 禁止
 *   - point:   anchorX/Y 必須・anchorElementId 禁止
 */
export const createThreadSchema = z
  .object({
    anchorKind: z.enum(["element", "point"]),
    anchorElementId: z.string().min(1).max(255).optional(),
    anchorX: z.number().finite().optional(),
    anchorY: z.number().finite().optional(),
    body: bodySchema,
    mentionedUserIds: mentionedUserIdsSchema,
  })
  .refine(
    (v) =>
      v.anchorKind === "element"
        ? v.anchorElementId !== undefined &&
          v.anchorX === undefined &&
          v.anchorY === undefined
        : v.anchorX !== undefined &&
          v.anchorY !== undefined &&
          v.anchorElementId === undefined,
    {
      error:
        "anchor が不正です（element は anchorElementId、point は anchorX/anchorY が必要）",
      path: ["anchorKind"],
    },
  );

/** 既存スレッドへの返信。 */
export const createCommentSchema = z.object({
  body: bodySchema,
  mentionedUserIds: mentionedUserIdsSchema,
});

/** コメント本文の編集（author のみ）。 */
export const updateCommentSchema = z.object({
  body: bodySchema,
});

/** スレッドの解決 / 再オープン。 */
export const resolveThreadSchema = z.object({
  resolved: z.boolean(),
});

/** スレッド一覧クエリ（resolved で絞り込み・未指定は全件）。 */
export const listThreadsQuerySchema = z.object({
  resolved: z.coerce.boolean().optional(),
});

/** メンション補完クエリ（org メンバーを前方一致）。 */
export const mentionableQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
});

/** 通知一覧クエリ（未読のみ・カーソル＝createdAt epoch ミリ秒）。 */
export const listNotificationsQuerySchema = z.object({
  unreadOnly: z.coerce.boolean().optional(),
  cursor: z.coerce.number().int().nonnegative().optional(),
});

/**
 * 既読化。`ids` 指定で個別既読、未指定で全件既読（自分宛のみ・org スコープ）。
 */
export const markReadSchema = z.object({
  ids: z.array(z.string().min(1).max(255)).max(200).optional(),
});

export type CreateThreadInput = z.infer<typeof createThreadSchema>;
export type CreateCommentInput = z.infer<typeof createCommentSchema>;
export type UpdateCommentInput = z.infer<typeof updateCommentSchema>;
export type ResolveThreadInput = z.infer<typeof resolveThreadSchema>;
export type ListThreadsQuery = z.infer<typeof listThreadsQuerySchema>;
export type MentionableQuery = z.infer<typeof mentionableQuerySchema>;
export type ListNotificationsQuery = z.infer<
  typeof listNotificationsQuerySchema
>;
export type MarkReadInput = z.infer<typeof markReadSchema>;
