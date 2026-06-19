import type {
  AppState,
  Collaborator,
  ExcalidrawImperativeAPI,
  SocketId,
} from "@excalidraw/excalidraw/types";
import type { PresenceSink, Transport } from "./sync-engine";
import type {
  ClientPresenceMessage,
  ParticipantInfo,
  PresenceMessage,
  PresencePointer,
  UserActivityState,
} from "./types";

/** カーソル送信のスロットル間隔（本家 Excalidraw の CURSOR_SYNC_TIMEOUT に合わせる）。 */
const CURSOR_THROTTLE_MS = 33;
/** 無操作でアイドル扱いにするまで。 */
const IDLE_AFTER_MS = 60_000;
/** 無操作で離席扱いにするまで。 */
const AWAY_AFTER_MS = 3 * 60_000;

/** Excalidraw `onPointerUpdate` のペイロード（必要な部分のみを構造的に受ける）。 */
export type PointerUpdatePayload = {
  pointer: PresencePointer;
  button: "down" | "up";
  pointersMap: { readonly size: number };
};

/** 参加者一覧の購読スナップショット（参照同値で安定。useSyncExternalStore 用）。 */
export type RosterSnapshot = {
  self: ParticipantInfo | null;
  others: ParticipantInfo[];
};

/** 参加者一覧 UI が購読する最小ストア。 */
export type PresenceStore = {
  subscribe(listener: () => void): () => void;
  getSnapshot(): RosterSnapshot;
};

/**
 * 揮発（presence）面のクライアント実装。
 *
 * - 送信: `onPointerUpdate` を 33ms スロットルで `MOUSE_LOCATION` 送信（マルチタッチ除外）。
 *   選択は `onChange` の `selectedElementIds` を同梱し、無操作で `IDLE_STATUS` を送る。
 * - 受信: `PRESENCE` を Excalidraw `collaborators` に反映してカーソル/選択を描画し、
 *   `PARTICIPANTS`（init/join/leave）で参加者ロスターを更新する（avatar 表示用に購読配信）。
 * - トランスポートは durable 同期と**同一ソケット**を共有する（presence 専用接続は張らない）。
 */
export class BoardPresence implements PresenceSink, PresenceStore {
  private readonly api: ExcalidrawImperativeAPI;
  private readonly transport: Transport;

  /** Excalidraw 描画用の collaborators（socketId → Collaborator）。 */
  private readonly collaborators = new Map<SocketId, Collaborator>();
  /** 参加者ロスター（socketId → 本人性）。avatar 表示の元。 */
  private roster = new Map<string, ParticipantInfo>();
  private self: ParticipantInfo | null = null;

  // 送信側スロットル/選択状態
  private lastPointer: PresencePointer | null = null;
  private lastButton: "down" | "up" = "up";
  private lastSelectedIds: Record<string, boolean> = {};
  private lastSelectionSig = "";
  private lastSentAt = 0;
  private throttleTimer: ReturnType<typeof setTimeout> | null = null;

  // アイドル検知
  private userState: UserActivityState = "active";
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private awayTimer: ReturnType<typeof setTimeout> | null = null;

  // ロスター購読（useSyncExternalStore）
  private readonly listeners = new Set<() => void>();
  private snapshot: RosterSnapshot = { self: null, others: [] };

  constructor(opts: { api: ExcalidrawImperativeAPI; transport: Transport }) {
    this.api = opts.api;
    this.transport = opts.transport;
  }

  // ---- 送信（Excalidraw イベントから呼ぶ） ----

  /** `onPointerUpdate` から呼ぶ。マルチタッチは除外し、33ms スロットルで送る。 */
  handlePointerUpdate(payload: PointerUpdatePayload): void {
    if (payload.pointersMap.size >= 2) return;
    this.lastPointer = payload.pointer;
    this.lastButton = payload.button;
    this.markActivity();
    this.scheduleSend();
  }

  /** `onChange` から呼ぶ。選択集合が変わったら（=ユーザー操作）カーソルに同梱して送る。 */
  handleSceneChange(appState: AppState): void {
    const selected = appState.selectedElementIds;
    const keys = Object.keys(selected)
      .filter((id) => selected[id])
      .sort();
    const sig = keys.join(",");
    // 選択変化なし（リモート適用由来の onChange を含む）はアイドル更新も送信もしない。
    if (sig === this.lastSelectionSig) return;
    this.lastSelectionSig = sig;
    const next: Record<string, boolean> = {};
    for (const id of keys) next[id] = true;
    this.lastSelectedIds = next;
    this.markActivity();
    if (this.lastPointer) this.scheduleSend();
  }

  private scheduleSend(): void {
    if (!this.transport.isOpen()) return;
    const elapsed = Date.now() - this.lastSentAt;
    if (elapsed >= CURSOR_THROTTLE_MS) {
      this.sendNow();
      return;
    }
    if (this.throttleTimer === null) {
      this.throttleTimer = setTimeout(() => {
        this.throttleTimer = null;
        this.sendNow();
      }, CURSOR_THROTTLE_MS - elapsed);
    }
  }

  private sendNow(): void {
    if (!this.lastPointer || !this.transport.isOpen()) return;
    this.lastSentAt = Date.now();
    const msg: ClientPresenceMessage = {
      type: "MOUSE_LOCATION",
      pointer: this.lastPointer,
      button: this.lastButton,
      selectedElementIds: this.lastSelectedIds,
    };
    this.transport.send(msg);
  }

  private markActivity(): void {
    if (this.userState !== "active") this.setUserState("active");
    this.resetIdleTimers();
  }

  private resetIdleTimers(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    if (this.awayTimer) clearTimeout(this.awayTimer);
    this.idleTimer = setTimeout(() => this.setUserState("idle"), IDLE_AFTER_MS);
    this.awayTimer = setTimeout(() => this.setUserState("away"), AWAY_AFTER_MS);
  }

  private setUserState(state: UserActivityState): void {
    if (this.userState === state) return;
    this.userState = state;
    const msg: ClientPresenceMessage = {
      type: "IDLE_STATUS",
      userState: state,
    };
    this.transport.send(msg);
  }

  // ---- 受信（sync-engine から委譲） ----

  handleMessage(msg: PresenceMessage): void {
    if (msg.type === "PRESENCE") {
      this.applyPresence(msg);
      return;
    }
    switch (msg.action) {
      case "init":
        this.self = msg.self;
        this.roster = new Map(msg.participants.map((p) => [p.socketId, p]));
        this.publishRoster();
        break;
      case "join":
        this.roster.set(msg.participant.socketId, msg.participant);
        this.publishRoster();
        break;
      case "leave":
        this.roster.delete(msg.socketId);
        if (this.collaborators.delete(msg.socketId as SocketId)) {
          this.flushCollaborators();
        }
        this.publishRoster();
        break;
    }
  }

  private applyPresence(
    msg: Extract<PresenceMessage, { type: "PRESENCE" }>,
  ): void {
    const key = msg.socketId as SocketId;
    const prev = this.collaborators.get(key);
    const next: Collaborator = {
      ...prev,
      id: msg.userId,
      username: msg.username,
      color: { background: msg.color, stroke: msg.color },
      ...(msg.pointer
        ? { pointer: msg.pointer, button: msg.button ?? "up" }
        : {}),
      ...(msg.selectedElementIds
        ? {
            selectedElementIds:
              msg.selectedElementIds as Collaborator["selectedElementIds"],
          }
        : {}),
      // userState は UserIdleState enum 型（値は "active"|"idle"|"away" で一致）。
      ...(msg.userState
        ? { userState: msg.userState as unknown as Collaborator["userState"] }
        : {}),
    };
    this.collaborators.set(key, next);
    this.flushCollaborators();
  }

  private flushCollaborators(): void {
    // collaborators のみの更新は要素・履歴に影響しない（captureUpdate 既定で安全）。
    this.api.updateScene({ collaborators: new Map(this.collaborators) });
  }

  // ---- ソケット開閉（sync-engine から委譲） ----

  onOpen(): void {
    // 再接続時はサーバが PARTICIPANTS init / SCENE_INIT を再送するため何もしない。
  }

  onClose(): void {
    this.roster.clear();
    this.collaborators.clear();
    this.self = null;
    this.lastSelectionSig = "";
    if (this.idleTimer) clearTimeout(this.idleTimer);
    if (this.awayTimer) clearTimeout(this.awayTimer);
    this.userState = "active";
    this.flushCollaborators();
    this.publishRoster();
  }

  // ---- ロスター購読ストア ----

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): RosterSnapshot => this.snapshot;

  private publishRoster(): void {
    const seen = new Set<string>();
    const others: ParticipantInfo[] = [];
    for (const p of this.roster.values()) {
      // 自分の別タブ・同一ユーザーの複数接続は 1 つに集約する。
      if (this.self && p.userId === this.self.userId) continue;
      if (seen.has(p.userId)) continue;
      seen.add(p.userId);
      others.push(p);
    }
    this.snapshot = { self: this.self, others };
    for (const listener of this.listeners) listener();
  }

  dispose(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    if (this.awayTimer) clearTimeout(this.awayTimer);
    if (this.throttleTimer) clearTimeout(this.throttleTimer);
    this.listeners.clear();
  }
}
