import type { Context } from "hono";
import { Hono } from "hono";
import {
  AssetConflictError,
  AssetTooLargeError,
  AssetUnsupportedMediaTypeError,
} from "../domain/errors/asset.error";
import { BoardForbiddenError } from "../domain/errors/board.error";
import { ValidationError } from "../domain/errors/domain.error";
import {
  detectImageFormat,
  MAX_BOARD_ASSET_BYTES,
  MAX_IMAGE_BYTES,
  validateUpload,
} from "../domain/services/asset-validation";
import { canEdit } from "../domain/services/board-access";
import type { Board, EffectiveRole } from "../domain/types/board";
import { createAssetRepository } from "../infrastructure/repositories/asset.repository";
import { createBoardRepository } from "../infrastructure/repositories/board.repository";
import { authMiddleware } from "../middleware/auth";
import { requirePermission } from "../middleware/rbac";
import type { AppEnv } from "../types";
import { createGetBoardService } from "../use-cases/board/get-board.service";
import { createGetEffectiveRoleService } from "../use-cases/board/get-effective-role.service";

/** マルチパート/生ボディの早期サイズガード（巨大ボードのメモリ読み込み抑止）。 */
const CONTENT_LENGTH_SLACK = 64 * 1024;

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * board の存在・org スコープ・実効ロールを解決する（M8/M9 の再認可）。
 * 非メンバー・別 org・不存在は `getBoard` が 404 を投げる（IDOR 防止）。
 */
async function requireBoardAccess(
  c: Context<AppEnv>,
  boardId: string,
): Promise<{ board: Board; effectiveRole: EffectiveRole }> {
  const boardRepo = createBoardRepository(c.env.DB);
  const getBoard = createGetBoardService({
    boardRepo,
    getEffectiveRole: createGetEffectiveRoleService({ boardRepo }),
  });
  return getBoard.execute({
    boardId,
    organizationId: c.get("activeOrganizationId"),
    userId: c.get("user").id,
  });
}

function tooLargeByHeader(c: Context<AppEnv>, limit: number): boolean {
  const len = Number(c.req.header("content-length") ?? "0");
  return Number.isFinite(len) && len > limit + CONTENT_LENGTH_SLACK;
}

/**
 * 画像アセット REST（`/api/boards/:id/assets`・`/thumbnail`）。
 *
 * - **R2 は server Worker 経由のみ**（クライアントへ直バインドしない）。
 * - アップロード/サムネ更新は `canEdit`、取得は board メンバー（再認可 M9）。
 * - アップロードは **D1 先・R2 後（G6）**：条件付き pending INSERT（削除中拒否 H6）→ R2 put →
 *   asset 作成＋ready 化。WS には画像バイナリを流さない（要素は fileId+status のみ）。
 */
export const assetRoute = new Hono<AppEnv>()
  .use("/*", authMiddleware)
  // 画像アップロード（multipart: file, fileId）
  .post("/:id/assets", requirePermission("board", "read"), async (c) => {
    const boardId = c.req.param("id");
    const { effectiveRole } = await requireBoardAccess(c, boardId);
    if (!canEdit(effectiveRole)) {
      throw new BoardForbiddenError("アップロードする権限がありません");
    }
    if (tooLargeByHeader(c, MAX_IMAGE_BYTES)) {
      throw new AssetTooLargeError();
    }

    const form = await c.req.formData();
    // workers-types では FormData の値型が string 寄りのため Blob として明示的に扱う。
    const file = form.get("file") as Blob | string | null;
    const fileId = form.get("fileId");
    if (file === null || typeof file === "string") {
      throw new ValidationError("file が必要です");
    }
    if (
      typeof fileId !== "string" ||
      fileId.length === 0 ||
      fileId.length > 256
    ) {
      throw new ValidationError("fileId が不正です");
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const { mime, width, height } = validateUpload({
      size: bytes.byteLength,
      bytes,
    });

    const assetRepo = createAssetRepository(c.env.DB);

    // 冪等性: 同一内容（= 同一 fileId）が既に ready なら再アップロードしない。
    const existing = await assetRepo.getAssetForRetrieve({
      boardId,
      fileId,
      now: Date.now(),
    });
    if (existing) {
      return c.json({ fileId, status: "ready" as const });
    }

    // ボード合計容量（N4）。
    const used = await assetRepo.sumReadyAssetBytes({ boardId });
    if (used + bytes.byteLength > MAX_BOARD_ASSET_BYTES) {
      throw new AssetTooLargeError("ボードの画像合計容量が上限を超えます");
    }

    const r2Key = `boards/${boardId}/assets/${fileId}`;
    const objectId = crypto.randomUUID();

    // ① D1 先: 条件付き pending INSERT（削除中ボードは 0 行 → 409, H6）。
    const inserted = await assetRepo.createPendingObject({
      id: objectId,
      boardId,
      kind: "asset",
      r2Key,
      now: Date.now(),
    });
    if (inserted === 0) {
      throw new AssetConflictError();
    }

    // ② R2 後（G6）: 失敗時は object を failed にし、孤児回収（Phase 6）に委ねる。
    try {
      await c.env.R2_ASSETS.put(r2Key, bytes, {
        httpMetadata: { contentType: mime },
      });
    } catch (error) {
      await assetRepo.markObjectStatus({
        id: objectId,
        status: "failed",
        now: Date.now(),
      });
      throw error;
    }

    // ③ asset 作成＋ready 化（同一バッチ・size 必須 I7・kind='asset' H7）。
    try {
      const sha256 = await sha256Hex(bytes);
      await assetRepo.finalizeAsset({
        boardId,
        fileId,
        r2ObjectId: objectId,
        mime,
        width,
        height,
        sha256,
        userId: c.get("user").id,
        size: bytes.byteLength,
        now: Date.now(),
      });
    } catch (error) {
      await assetRepo.markObjectStatus({
        id: objectId,
        status: "failed",
        now: Date.now(),
      });
      throw error;
    }

    return c.json({ fileId, status: "ready" as const });
  })
  // 画像取得（再認可 M9・ready のみ配信 F9）
  .get("/:id/assets/:fileId", requirePermission("board", "read"), async (c) => {
    const boardId = c.req.param("id");
    const fileId = c.req.param("fileId");
    await requireBoardAccess(c, boardId);

    const assetRepo = createAssetRepository(c.env.DB);
    const found = await assetRepo.getAssetForRetrieve({
      boardId,
      fileId,
      now: Date.now(),
    });
    if (!found) {
      return c.json({ error: "Not Found" }, 404);
    }
    const object = await c.env.R2_ASSETS.get(found.r2Key);
    if (!object) {
      return c.json({ error: "Not Found" }, 404);
    }
    // fileId は内容ハッシュ（content-addressed）なので長期 immutable で安全。
    return new Response(object.body, {
      headers: {
        "Content-Type": found.mime,
        "Cache-Control": "private, max-age=31536000, immutable",
        ETag: object.httpEtag,
      },
    });
  })
  // サムネ更新（PNG・canEdit）
  .put("/:id/thumbnail", requirePermission("board", "read"), async (c) => {
    const boardId = c.req.param("id");
    const { effectiveRole } = await requireBoardAccess(c, boardId);
    if (!canEdit(effectiveRole)) {
      throw new BoardForbiddenError("サムネを更新する権限がありません");
    }
    if (tooLargeByHeader(c, MAX_IMAGE_BYTES)) {
      throw new AssetTooLargeError();
    }

    const bytes = new Uint8Array(await c.req.arrayBuffer());
    if (detectImageFormat(bytes) !== "png") {
      throw new AssetUnsupportedMediaTypeError("サムネは PNG のみ対応です");
    }
    if (bytes.byteLength > MAX_IMAGE_BYTES) {
      throw new AssetTooLargeError();
    }

    const r2Key = `boards/${boardId}/thumbnail.png`;
    const assetRepo = createAssetRepository(c.env.DB);

    // D1 整合バッチ（manifest + board.thumbnail_key）→ R2（固定キー・orphan は manifest 被覆）。
    await assetRepo.setThumbnail({
      objectId: crypto.randomUUID(),
      boardId,
      organizationId: c.get("activeOrganizationId"),
      r2Key,
      size: bytes.byteLength,
      now: Date.now(),
    });
    await c.env.R2_ASSETS.put(r2Key, bytes, {
      httpMetadata: { contentType: "image/png" },
    });

    return c.json({ success: true });
  })
  // サムネ取得（board メンバー・ダッシュボード表示用）
  .get("/:id/thumbnail", requirePermission("board", "read"), async (c) => {
    const boardId = c.req.param("id");
    const { board } = await requireBoardAccess(c, boardId);
    if (!board.thumbnailKey) {
      return c.json({ error: "Not Found" }, 404);
    }
    const object = await c.env.R2_ASSETS.get(board.thumbnailKey);
    if (!object) {
      return c.json({ error: "Not Found" }, 404);
    }
    return new Response(object.body, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "private, max-age=30",
        ETag: object.httpEtag,
      },
    });
  });
