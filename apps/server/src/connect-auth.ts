/**
 * Composition Root 用ヘルパ：Board WS 入室認証（onBeforeConnect から呼ぶ）。
 *
 * `@liveboard/auth`（BetterAuth）は dep-cruiser により内側レイヤから直接 import できないため、
 * ここ（src 直下＝composition root）で吸収する。検証済み identity を **サーバ側ヘッダ**として
 * 焼き込んだ Request を返し、クライアントが送出した同名ヘッダは破棄する（偽装無効化・N1）。
 */

import { auth } from "@liveboard/auth";
import { createBoardRepository } from "./infrastructure/repositories/board.repository";
import type { AppEnv } from "./types";
import { createGetEffectiveRoleService } from "./use-cases/board/get-effective-role.service";

/**
 * presence アバター URL をヘッダ安全な形に正規化する。http(s) の絶対 URL のみ許可し、
 * それ以外（null/相対/ data: / 制御文字混入）は空文字を返す。ヘッダ injection（CRLF）と
 * 不正 src を同時に防ぐ。
 */
function sanitizeImageUrl(value: string | null | undefined): string {
  if (!value) return "";
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return "";
    // URL.href は制御文字を %エンコードするため ByteString として常に安全。
    return url.href;
  } catch {
    return "";
  }
}

/** クライアントが偽装し得る identity ヘッダ（必ず破棄して上書きする）。 */
const IDENTITY_HEADERS = [
  "x-user-id",
  "x-board-role",
  "x-username",
  "x-user-image",
  "x-organization-id",
];

/**
 * WS 入室の認可。成功なら identity ヘッダ付き Request、失敗なら拒否 Response を返す。
 *   1. BetterAuth セッション検証（無効→401）
 *   2. active organization（無→400）
 *   3. board を org スコープで取得（存在しない/別 org→404、purging→403・§8.1）
 *   4. effective role（M8）解決（非メンバー→403）
 *   5. 検証済み identity をサーバ側ヘッダで付与した Request を返す
 */
export async function authorizeBoardConnection(
  request: Request,
  env: AppEnv["Bindings"],
  boardId: string,
): Promise<Request | Response> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }

  const organizationId = session.session.activeOrganizationId;
  if (!organizationId) {
    return new Response("No active organization", { status: 400 });
  }

  const boardRepo = createBoardRepository(env.DB);
  const board = await boardRepo.findBoardForConnection({
    boardId,
    organizationId,
  });
  if (!board) {
    return new Response("Not found", { status: 404 });
  }
  if (board.deletionState !== "active") {
    return new Response("Board is being deleted", { status: 403 });
  }

  const role = await createGetEffectiveRoleService({ boardRepo }).execute({
    boardId,
    organizationId,
    userId: session.user.id,
  });
  if (role === null) {
    return new Response("Forbidden", { status: 403 });
  }

  const headers = new Headers(request.headers);
  for (const name of IDENTITY_HEADERS) headers.delete(name);
  headers.set("x-user-id", session.user.id);
  headers.set("x-board-role", role);
  headers.set("x-username", session.user.name);
  // presence アバター用のプロフィール画像 URL（OAuth 由来・未設定なら空文字）。
  // ヘッダは ByteString のため改行等の不正文字が混じると set が throw する→ URL の
  // 構文として正当なもののみ通す（不正値は空にフォールバックして接続自体は妨げない）。
  headers.set("x-user-image", sanitizeImageUrl(session.user.image));
  headers.set("x-organization-id", organizationId);
  return new Request(request, { headers });
}
