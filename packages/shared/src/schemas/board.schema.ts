import { z } from "zod";

/**
 * ボード管理 API の入力スキーマ（route 層で使用する共有スキーマ）。
 *
 * - web（Server Action）と server（route validator）の両方で使う。
 * - WS メッセージ（SCENE_UPDATE 等）と コメント API のスキーマはここに置かない
 *   （前者は Phase 2 の realtime 層、後者は Phase 5 の comment.schema.ts）。
 */

/** ボード作成。title 未指定なら "Untitled"。 */
export const createBoardSchema = z.object({
  title: z.string().trim().min(1).max(100).default("Untitled"),
});

/** ボードのリネーム。 */
export const renameBoardSchema = z.object({
  title: z.string().trim().min(1).max(100),
});

/** ボード一覧クエリ（前方一致検索 q・お気に入り絞り込み・並び順）。 */
export const listBoardsQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  favorite: z.coerce.boolean().optional(),
  sort: z.enum(["recent", "title"]).default("recent"),
});

/** board_role の付与・変更（owner/editor/viewer）。 */
export const setBoardRoleSchema = z.object({
  userId: z.string().min(1),
  role: z.enum(["owner", "editor", "viewer"]),
});

export type CreateBoardInput = z.infer<typeof createBoardSchema>;
export type RenameBoardInput = z.infer<typeof renameBoardSchema>;
export type ListBoardsQuery = z.infer<typeof listBoardsQuerySchema>;
export type SetBoardRoleInput = z.infer<typeof setBoardRoleSchema>;
