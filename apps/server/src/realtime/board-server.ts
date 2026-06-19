import {
  type Connection,
  type ConnectionContext,
  Server,
  type WSMessage,
} from "partyserver";
import { canEdit } from "../domain/services/board-access";
import { createBoardRepository } from "../infrastructure/repositories/board.repository";
import { createGetEffectiveRoleService } from "../use-cases/board/get-effective-role.service";
import {
  applyBatch,
  currentRevision,
  initRoom,
  liveFileRefs,
  purgeRoom,
  runProcessedUpdateGc,
  runTombstoneGc,
  snapshotElements,
} from "./board-sqlite";
import {
  ACTIVITY_DEBOUNCE_MS,
  AUTHZ_REAUTH_TTL_MS,
  GC_ALARM_INTERVAL_MS,
  IDEMPOTENCY_TTL_MS,
  MAX_DURABLE_BYTES,
  MAX_ELEMENTS_PER_BOARD,
  MAX_PRESENCE_BYTES,
  TOMBSTONE_RETENTION_MS,
} from "./limits";
import {
  type ClientMessage,
  type CommentBroadcast,
  clientMessageSchema,
  type ParticipantInfo,
  type SceneUpdateMessage,
  type ServerMessage,
} from "./protocol";
import { deriveFromPayload, hashBatch, ProtocolError } from "./reconcile";

/**
 * DO が必要とする env の最小サブセット（apps/server スコープでは Cloudflare.Env が空のため明示）。
 */
type BoardEnv = {
  DB: D1Database;
  CORS_ORIGIN: string;
};

/** 接続 state（≤2KB の最小限・N5）。identity はサーバ側ヘッダ由来で改ざん不能（N1）。 */
type ConnState = {
  userId: string;
  role: "owner" | "editor" | "viewer";
  username: string;
  /** userId から決定論的に割り当てた presence 色（hex）。 */
  color: string;
  /** presence アバター用プロフィール画像 URL（未設定なら空文字）。 */
  image: string;
  /** 失効切断（M7）の再認可用: 入室時に焼き込んだ org（D1 再取得のスコープ）。 */
  organizationId: string;
  /** この時刻を過ぎたら durable 更新前に D1 から effective role を再取得する（M7）。 */
  authzExpiresAt: number;
};

function isBoardRole(value: unknown): value is ConnState["role"] {
  return value === "owner" || value === "editor" || value === "viewer";
}

/**
 * presence の識別色パレット（背景上で視認しやすい彩度のセット）。
 * userId のハッシュで決定論的に選び、同一ユーザーは常に同色になる（state にも保存）。
 */
const PRESENCE_COLORS = [
  "#e8590c",
  "#2f9e44",
  "#1971c2",
  "#9c36b5",
  "#0c8599",
  "#e03131",
  "#5f3dc4",
  "#f08c00",
  "#c2255c",
  "#2b8a3e",
] as const;

function colorForUser(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = (hash * 31 + userId.charCodeAt(i)) | 0;
  }
  return PRESENCE_COLORS[Math.abs(hash) % PRESENCE_COLORS.length] as string;
}

/**
 * 1 ボード = 1 Durable Object の authoritative 同期中核。
 *
 * - DO SQLite を正本に `transactionSync()` で要素単位 LWW を採否判定し、
 *   `server_revision`＋ACK＋RESYNC で収束させる（テーブル §5）。
 * - 入室認証/認可は index.ts の onBeforeConnect でサーバ側ヘッダに焼き込み、
 *   ここでは state に保持してメッセージごとに権限再確認（M6）する。
 * - 常駐タイマー不使用。GC は onAlarm + setAlarm（ハイバネーション維持）。
 */
export class Board extends Server<BoardEnv> {
  static options = { hibernate: true };

  /** D1 last_activity_at のデバウンス用（in-memory・ハイバネーションで失われて良い）。 */
  private lastActivityFlush = 0;

  /** DO SQLite ハンドル（partyserver の `sql` タグ付きテンプレートとは別物）。 */
  private get store(): SqlStorage {
    return this.ctx.storage.sql;
  }

  private send(connection: Connection, msg: ServerMessage): void {
    connection.send(JSON.stringify(msg));
  }

  /**
   * §5.4 初期化。PartyServer 0.5.8 は onStart を既に blockConcurrencyWhile で囲むため
   * **ここで二重に囲まない**（I8）。GC alarm 未設定なら予約する。
   */
  async onStart(): Promise<void> {
    initRoom(this.store, this.name, Date.now());
    const alarm = await this.ctx.storage.getAlarm();
    if (alarm === null) {
      await this.ctx.storage.setAlarm(Date.now() + GC_ALARM_INTERVAL_MS);
    }
  }

  onConnect(connection: Connection, ctx: ConnectionContext): void {
    // onBeforeConnect が付与した検証済みヘッダのみを信用（クライアント送出は破棄済み）。
    const userId = ctx.request.headers.get("x-user-id");
    const role = ctx.request.headers.get("x-board-role");
    const username = ctx.request.headers.get("x-username") ?? "";
    const image = ctx.request.headers.get("x-user-image") ?? "";
    const organizationId = ctx.request.headers.get("x-organization-id") ?? "";
    if (!userId || !isBoardRole(role) || !organizationId) {
      connection.close(1008, "unauthorized");
      return;
    }
    const color = colorForUser(userId);
    connection.setState({
      userId,
      role,
      username,
      color,
      image,
      organizationId,
      authzExpiresAt: Date.now() + AUTHZ_REAUTH_TTL_MS,
    } satisfies ConnState);

    // 現在の正規スナップショットを送信（fractional_index 順の生存要素）。
    const snapshot = snapshotElements(this.store);
    this.send(connection, {
      type: "SCENE_INIT",
      serverRevision: snapshot.serverRevision,
      elements: snapshot.elements,
    });

    // 揮発: 参加者ロスター。新規接続へ「自分＋現在の参加者一覧」を送り、他の参加者へ join を配信。
    const self: ParticipantInfo = {
      socketId: connection.id,
      userId,
      username,
      color,
      ...(image ? { image } : {}),
    };
    this.send(connection, {
      type: "PARTICIPANTS",
      action: "init",
      self,
      participants: this.rosterExcept(connection.id),
    });
    this.broadcast(
      JSON.stringify({
        type: "PARTICIPANTS",
        action: "join",
        participant: self,
      } satisfies ServerMessage),
      [connection.id],
    );
  }

  /** 現在の参加者（指定 socketId を除く）。state が未設定の接続はスキップ。 */
  private rosterExcept(exceptId: string): ParticipantInfo[] {
    const participants: ParticipantInfo[] = [];
    for (const conn of this.getConnections()) {
      if (conn.id === exceptId) continue;
      const s = conn.state as ConnState | null;
      if (!s) continue;
      participants.push({
        socketId: conn.id,
        userId: s.userId,
        username: s.username,
        color: s.color,
        ...(s.image ? { image: s.image } : {}),
      });
    }
    return participants;
  }

  async onMessage(connection: Connection, message: WSMessage): Promise<void> {
    const raw =
      typeof message === "string" ? message : new TextDecoder().decode(message);

    // サイズ検証（N2/H3・≤256KB）。揮発はさらに ≤16KB を後段で課す。
    const byteLength = new TextEncoder().encode(raw).length;
    if (byteLength > MAX_DURABLE_BYTES) {
      this.send(connection, {
        type: "ERROR",
        code: "PAYLOAD_TOO_LARGE",
        message: "メッセージが大きすぎます",
      });
      return;
    }

    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      this.send(connection, {
        type: "ERROR",
        code: "BAD_REQUEST",
        message: "不正なメッセージです",
      });
      return;
    }

    const parsed = clientMessageSchema.safeParse(json);
    if (!parsed.success) {
      this.send(connection, {
        type: "ERROR",
        code: "BAD_REQUEST",
        message: "不正なメッセージです",
      });
      return;
    }

    if (parsed.data.type === "SCENE_UPDATE") {
      await this.handleSceneUpdate(connection, parsed.data);
      return;
    }
    if (
      parsed.data.type === "MOUSE_LOCATION" ||
      parsed.data.type === "IDLE_STATUS"
    ) {
      this.handleVolatile(connection, parsed.data, byteLength);
      return;
    }
    // RESYNC_REQUEST: 現在のスナップショットを当該接続へ返す（revision ギャップ回復）。
    const snapshot = snapshotElements(this.store);
    this.send(connection, {
      type: "RESYNC",
      serverRevision: snapshot.serverRevision,
      elements: snapshot.elements,
    });
  }

  /**
   * 揮発（presence）の broadcast。**DO SQLite に書かない・revision を進めない・ACK しない**。
   * socketId/userId/username/color は接続 state から付与（クライアント申告値は使わない＝なりすまし防止）。
   * 16KB 超は DoS 抑止のため無応答で破棄する（揮発のため再送・ACK は不要）。
   */
  private handleVolatile(
    connection: Connection,
    msg: Extract<ClientMessage, { type: "MOUSE_LOCATION" | "IDLE_STATUS" }>,
    byteLength: number,
  ): void {
    if (byteLength > MAX_PRESENCE_BYTES) return;
    const state = connection.state as ConnState | null;
    if (!state) return;

    const identity: ParticipantInfo = {
      socketId: connection.id,
      userId: state.userId,
      username: state.username,
      color: state.color,
      ...(state.image ? { image: state.image } : {}),
    };
    const presence: ServerMessage =
      msg.type === "MOUSE_LOCATION"
        ? {
            type: "PRESENCE",
            ...identity,
            pointer: msg.pointer,
            button: msg.button,
            selectedElementIds: msg.selectedElementIds,
          }
        : { type: "PRESENCE", ...identity, userState: msg.userState };

    this.broadcast(JSON.stringify(presence), [connection.id]);
  }

  private rejectAck(
    connection: Connection,
    clientUpdateId: string,
    status: "rejected_unauthorized" | "rejected_invalid",
  ): void {
    this.send(connection, {
      type: "ACK",
      clientUpdateId,
      status,
      serverRevision: currentRevision(this.store),
      accepted: [],
      rejected: [],
    });
  }

  /**
   * M7 期限付き再認可。`authzExpiresAt` 切れなら D1 から effective role を再取得し、
   * 退会/別 org 移動（null）や editor→viewer 降格なら接続を `close()` して null を返す。
   * 維持なら `authzExpiresAt` を更新した state を返す。これにより最大 60s で失効が反映される。
   */
  private async ensureAuthorized(
    connection: Connection,
    state: ConnState,
  ): Promise<ConnState | null> {
    const now = Date.now();
    if (now <= state.authzExpiresAt) return state;

    const boardRepo = createBoardRepository(this.env.DB);
    const role = await createGetEffectiveRoleService({ boardRepo }).execute({
      boardId: this.name,
      organizationId: state.organizationId,
      userId: state.userId,
    });
    if (role === null || !canEdit(role)) {
      // 退会/非メンバー or viewer 降格 → 当該更新を拒否し編集セッションを即時切断。
      connection.close(4003, "revoked");
      return null;
    }
    const next: ConnState = {
      ...state,
      role,
      authzExpiresAt: now + AUTHZ_REAUTH_TTL_MS,
    };
    connection.setState(next);
    return next;
  }

  private async handleSceneUpdate(
    connection: Connection,
    msg: SceneUpdateMessage,
  ): Promise<void> {
    const initial = connection.state as ConnState | null;
    if (!initial) {
      this.rejectAck(connection, msg.clientUpdateId, "rejected_unauthorized");
      return;
    }
    // M7: 期限切れなら D1 から effective role を再取得（退会/降格を最大 60s で反映・接続も切断）。
    const state = await this.ensureAuthorized(connection, initial);
    if (!state) return; // 降格/失効 → 既に close 済み
    // M6: メッセージごとの権限再確認。viewer/未認可の durable 更新を拒否。
    if (!canEdit(state.role)) {
      this.rejectAck(connection, msg.clientUpdateId, "rejected_unauthorized");
      return;
    }

    // H3: バッチ内 ID 重複拒否（空バッチは schema で拒否済み）。
    const ids = msg.elements.map((e) => e.id);
    if (new Set(ids).size !== ids.length) {
      this.rejectAck(connection, msg.clientUpdateId, "rejected_invalid");
      return;
    }

    const norm = msg.elements.map(deriveFromPayload);

    // アプリ上限（N4）: 生存要素数 + バッチの非削除要素が上限を超えるなら保守的に拒否。
    const liveCount = this.store
      .exec<{ c: number }>(
        "SELECT COUNT(*) AS c FROM element WHERE is_deleted = 0",
      )
      .one().c;
    const incomingLive = norm.filter((e) => !e.isDeleted).length;
    if (liveCount + incomingLive > MAX_ELEMENTS_PER_BOARD) {
      this.rejectAck(connection, msg.clientUpdateId, "rejected_invalid");
      return;
    }

    const requestHash = await hashBatch(norm);
    const now = Date.now();

    let result: ReturnType<typeof applyBatch>;
    try {
      result = this.ctx.storage.transactionSync(() =>
        applyBatch(this.store, msg.clientUpdateId, requestHash, norm, now),
      );
    } catch (error) {
      if (error instanceof ProtocolError) {
        this.rejectAck(connection, msg.clientUpdateId, "rejected_invalid");
        return;
      }
      throw error;
    }

    // 送信元への ACK。
    this.send(connection, {
      type: "ACK",
      clientUpdateId: msg.clientUpdateId,
      status: result.status,
      serverRevision: result.serverRevision,
      accepted: result.accepted,
      rejected: result.rejected,
    });

    // applied===true（新規採用）のときのみ採用差分を送信元以外へ broadcast。
    // already_applied / conflict は broadcast しない（I1）。
    if (result.applied) {
      this.broadcast(
        JSON.stringify({
          type: "SCENE_UPDATE",
          serverRevision: result.serverRevision,
          elements: msg.elements,
        } satisfies ServerMessage),
        [connection.id],
      );
      this.touchActivity(now);
    }
  }

  /** D1 last_activity_at をデバウンス更新（write-through とは別物・§5.5/§8.4）。 */
  private touchActivity(now: number): void {
    if (now - this.lastActivityFlush < ACTIVITY_DEBOUNCE_MS) return;
    this.lastActivityFlush = now;
    this.ctx.waitUntil(
      createBoardRepository(this.env.DB)
        .touchLastActivity({ boardId: this.name, now })
        .catch(() => {
          // アクティビティ通知の失敗は正本の永続性に影響しないため握りつぶす。
        }),
    );
  }

  /** §5.3 GC（トゥームストーン + processed_update）。setInterval は使わず alarm で再予約。 */
  async onAlarm(): Promise<void> {
    const now = Date.now();
    runTombstoneGc(this.store, now, TOMBSTONE_RETENTION_MS);
    runProcessedUpdateGc(this.store, now, IDEMPOTENCY_TTL_MS);
    await this.ctx.storage.setAlarm(now + GC_ALARM_INTERVAL_MS);
  }

  /**
   * route から RPC で呼ばれるコメントイベント配信（Phase 5）。**D1 が正本・DO は配信のみ**で
   * DO SQLite には一切書かない。参加者全員へ `COMMENT` を broadcast し、被メンションのうち
   * 当該ボードに接続中の userId へ `NOTIFICATION` を push する（接続 state の userId で対象特定・
   * オフライン者は D1 永続化済みで通知センターから後追い確認 F-CM-06）。
   */
  async broadcastCommentEvent(event: CommentBroadcast): Promise<void> {
    this.broadcast(JSON.stringify(event.message));
    if (!event.notification || event.notifyUserIds.length === 0) return;
    const targets = new Set(event.notifyUserIds);
    const payload = JSON.stringify(event.notification);
    for (const conn of this.getConnections()) {
      const s = conn.state as ConnState | null;
      if (s && targets.has(s.userId)) conn.send(payload);
    }
  }

  /**
   * 削除 Saga（§8.1）の `queued→purging_do`: DO SQLite を全消去し、既存接続を強制切断する。
   * 以降の新規入室は board.deletion_state!='active' により onBeforeConnect で拒否される。
   * 冪等（再 claim で再呼び出しされても空消去＋切断で安全）。
   */
  async purge(): Promise<void> {
    for (const conn of this.getConnections()) {
      try {
        conn.close(1001, "board deleted");
      } catch {
        // 既に閉じている接続は無視。
      }
    }
    purgeRoom(this.store);
    // 残存 GC alarm を解除（purge 後の空ルームを起こし続けないため）。
    await this.ctx.storage.deleteAlarm().catch(() => {});
  }

  /**
   * アセット GC（I4）: 指定 fileId のうち**生存要素から参照中**のものを返す。
   * 候補化時と削除直前の二段階で呼び、TOCTOU を避ける。
   */
  async hasLiveFileRefs(fileIds: string[]): Promise<string[]> {
    return liveFileRefs(this.store, fileIds);
  }

  /**
   * 失効切断（M7・即時 revoke）: 指定 userId の接続を即時 `close()` する。
   * メンバー削除/ロール降格の route 成功時に呼ばれる（期限付き再認可の補助）。
   */
  async revokeUser(userId: string): Promise<void> {
    for (const conn of this.getConnections()) {
      const s = conn.state as ConnState | null;
      if (s && s.userId === userId) {
        try {
          conn.close(4003, "revoked");
        } catch {
          // 既に閉じている接続は無視。
        }
      }
    }
  }

  /** 退室を全参加者へ配信（揮発・presence ロスターから除去させる）。 */
  onClose(connection: Connection): void {
    this.broadcast(
      JSON.stringify({
        type: "PARTICIPANTS",
        action: "leave",
        socketId: connection.id,
      } satisfies ServerMessage),
    );
  }

  onError(_connection: Connection, error: unknown): void {
    console.error("[Board] connection error:", error);
  }
}
