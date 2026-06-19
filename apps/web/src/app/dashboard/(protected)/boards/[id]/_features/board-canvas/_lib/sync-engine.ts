import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { PartySocket } from "partysocket";
import type { PresenceMessage, RejectedEntry, ServerToClient } from "./types";

/** onChange の連続発火を間引いて送信する間隔（ms）。 */
const FLUSH_THROTTLE_MS = 100;
/** 1 メッセージの要素数上限（サーバ MAX_BATCH_ELEMENTS と整合）。 */
const MAX_BATCH_ELEMENTS = 2_000;

type SceneElement = { id: string; version: number };

type ExcalidrawLib = {
  reconcileElements: (
    local: readonly unknown[],
    remote: readonly unknown[],
    appState: unknown,
  ) => unknown[];
  restoreElements: (elements: unknown, local: readonly unknown[]) => unknown[];
  captureNever: string;
};

type InFlight = {
  clientUpdateId: string;
  /** 送信時の (id → version)。ACK 後に「送信後の新しい変更」と区別するため。 */
  versions: Map<string, number>;
};

export type BoardSyncOptions = {
  serverUrl: string;
  boardId: string;
  api: ExcalidrawImperativeAPI;
  canEdit: boolean;
};

/** 揮発メッセージ送信口。presence は専用ソケットを持たず、この共有トランスポートを使う。 */
export type Transport = {
  /** OPEN なら JSON 送信して true。切断中は送らず false。 */
  send(data: object): boolean;
  isOpen(): boolean;
};

/** presence の受け口。sync-engine がソケットを所有し、揮発メッセージと開閉を委譲する。 */
export type PresenceSink = {
  handleMessage(msg: PresenceMessage): void;
  /** ソケット接続時（再接続含む）。 */
  onOpen(): void;
  /** ソケット切断時。 */
  onClose(): void;
};

/** コメント/通知（Phase 5）の WS メッセージ最小形。実体は comments 側で narrow する。 */
export type CommentWireMessage = {
  type: "COMMENT" | "NOTIFICATION";
  [key: string]: unknown;
};

/**
 * コメント/通知の受け口。sync-engine がソケットを所有し、`COMMENT`/`NOTIFICATION` を委譲する。
 * scene 同期の apply chain は通さず即時に渡す（コメントは durable 同期と独立）。
 */
export type CommentSink = {
  handleMessage(msg: CommentWireMessage): void;
};

/**
 * サーバ authoritative 同期エンジン（クライアント側）。
 *
 * - partysocket で Board DO に接続（再接続は partysocket 任せ）。
 * - 受信は restore→reconcile→updateScene(NEVER) で適用（undo を汚さない）。
 * - 送信は「サーバ確定版（acknowledgedVersions）と現在シーンの差分」を 1 バッチで送り、
 *   ACK で確定版を更新する。in-flight は 1 つに限定し、conflict は新 clientUpdateId で再送（I6）。
 * - 切断中は送らずシーンに保持し、再接続時の SCENE_INIT で reconcile→未送信を再送する。
 */
export class BoardSyncEngine {
  private readonly serverUrl: string;
  private readonly boardId: string;
  private readonly api: ExcalidrawImperativeAPI;
  private readonly canEdit: boolean;

  private socket: PartySocket | null = null;
  private excalidraw: ExcalidrawLib | null = null;
  private presenceSink: PresenceSink | null = null;
  private commentSink: CommentSink | null = null;

  /** サーバが確定した (id → version)。差分送信・エコー抑止の基準。 */
  private readonly acknowledgedVersions = new Map<string, number>();
  private inFlight: InFlight | null = null;
  private flushScheduled = false;
  private lastRevision: number | null = null;
  /** 受信適用を直列化して reconcile の競合を防ぐ。 */
  private applyChain: Promise<void> = Promise.resolve();
  private disposed = false;

  constructor(opts: BoardSyncOptions) {
    this.serverUrl = opts.serverUrl;
    this.boardId = opts.boardId;
    this.api = opts.api;
    this.canEdit = opts.canEdit;
  }

  /** 揮発（presence）の受け口を接続する。`connect()` の前に設定する。 */
  setPresenceSink(sink: PresenceSink | null): void {
    this.presenceSink = sink;
  }

  /** コメント/通知の受け口を接続する。接続後でも差し替え可能（comments のマウントに追従）。 */
  setCommentSink(sink: CommentSink | null): void {
    this.commentSink = sink;
  }

  connect(): void {
    this.socket = new PartySocket({
      host: this.serverUrl,
      party: "board",
      room: this.boardId,
      // 既定の無制限送信キューに依存しない（M4）。OPEN かつ in-flight 無しのときだけ送る。
      maxEnqueuedMessages: 0,
    });
    this.socket.addEventListener("message", (event) => {
      if (typeof event.data !== "string") return;
      let parsed: unknown;
      try {
        parsed = JSON.parse(event.data);
      } catch {
        return;
      }
      const type = (parsed as { type?: string }).type;
      // 揮発（presence）は durable の apply chain を通さず即時に処理する（カーソル遅延回避）。
      if (type === "PRESENCE" || type === "PARTICIPANTS") {
        this.presenceSink?.handleMessage(parsed as PresenceMessage);
        return;
      }
      // コメント/通知も scene 同期と独立に即時処理する（D1 が正本・配信のみ）。
      if (type === "COMMENT" || type === "NOTIFICATION") {
        this.commentSink?.handleMessage(parsed as CommentWireMessage);
        return;
      }
      this.enqueue(() => this.handleMessage(parsed as ServerToClient));
    });
    this.socket.addEventListener("open", () => this.presenceSink?.onOpen());
    this.socket.addEventListener("close", () => this.presenceSink?.onClose());
  }

  /** 揮発送信（Transport）。OPEN のときだけ送る。 */
  send(data: object): boolean {
    if (this.socket?.readyState !== WebSocket.OPEN) return false;
    this.socket.send(JSON.stringify(data));
    return true;
  }

  isOpen(): boolean {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  dispose(): void {
    this.disposed = true;
    this.socket?.close();
    this.socket = null;
  }

  /** Excalidraw onChange から呼ぶ。差分送信をスケジュールする。 */
  onLocalChange(): void {
    if (!this.canEdit) return;
    this.scheduleFlush();
  }

  // ---- 内部 ----

  private enqueue(task: () => Promise<void>): void {
    this.applyChain = this.applyChain
      .then(task)
      .catch((e) => console.error("[board-sync]", e));
  }

  private async excalidrawLib(): Promise<ExcalidrawLib> {
    if (!this.excalidraw) {
      const m = await import("@excalidraw/excalidraw");
      this.excalidraw = {
        reconcileElements:
          m.reconcileElements as ExcalidrawLib["reconcileElements"],
        restoreElements: m.restoreElements as ExcalidrawLib["restoreElements"],
        captureNever: m.CaptureUpdateAction.NEVER,
      };
    }
    return this.excalidraw;
  }

  private async handleMessage(msg: ServerToClient): Promise<void> {
    switch (msg.type) {
      case "SCENE_INIT":
      case "RESYNC":
        // authoritative リセット（gap 判定はしない）。
        this.lastRevision = msg.serverRevision;
        await this.applyRemote(msg.elements);
        this.scheduleFlush();
        break;
      case "SCENE_UPDATE":
        this.observeRevision(msg.serverRevision);
        await this.applyRemote(msg.elements);
        break;
      case "ACK":
        await this.handleAck(msg);
        break;
      case "ERROR":
        console.warn("[board-sync] server error", msg.code, msg.message);
        break;
    }
  }

  /** 受信要素を restore→reconcile→updateScene(NEVER) で適用し、確定版を更新する。 */
  private async applyRemote(remoteElements: unknown[]): Promise<void> {
    if (this.disposed) return;
    const lib = await this.excalidrawLib();
    const existing = this.api.getSceneElementsIncludingDeleted();
    const restored = lib.restoreElements(remoteElements, existing);
    const reconciled = lib.reconcileElements(
      existing,
      restored,
      this.api.getAppState(),
    );

    // 確定版はサーバ payload の version で更新（local-won 要素は確定版が低いまま＝未送信扱い）。
    for (const el of remoteElements) {
      const e = el as Partial<SceneElement>;
      if (typeof e.id === "string" && typeof e.version === "number") {
        this.acknowledgedVersions.set(e.id, e.version);
      }
    }

    this.api.updateScene({
      elements: reconciled as never,
      captureUpdate: lib.captureNever as never,
    });
  }

  private observeRevision(rev: number): void {
    if (this.lastRevision === null) {
      this.lastRevision = rev;
      return;
    }
    if (rev > this.lastRevision + 1) {
      // ギャップ検出 → RESYNC 要求（定期フル broadcast は行わない M3）。
      this.lastRevision = rev;
      this.requestResync();
    } else if (rev > this.lastRevision) {
      this.lastRevision = rev;
    }
  }

  private requestResync(): void {
    if (this.socket?.readyState !== WebSocket.OPEN) return;
    this.socket.send(
      JSON.stringify({
        type: "RESYNC_REQUEST",
        fromRevision: this.lastRevision ?? 0,
      }),
    );
  }

  private async handleAck(
    ack: Extract<ServerToClient, { type: "ACK" }>,
  ): Promise<void> {
    if (!this.inFlight || ack.clientUpdateId !== this.inFlight.clientUpdateId) {
      return; // 対応する in-flight が無ければ無視
    }
    this.inFlight = null;

    if (ack.status === "accepted" || ack.status === "already_applied") {
      this.observeRevision(ack.serverRevision);
      // 確定版を更新（送信後に積まれた更に新しい変更は確定版より新しいので残る＝H1）。
      for (const { id, version } of ack.accepted) {
        this.acknowledgedVersions.set(id, version);
      }
      this.scheduleFlush();
      return;
    }

    if (ack.status === "conflict") {
      // I6: authoritative で rebase → 残りの非競合をスケジュール再送（新 clientUpdateId）。
      await this.applyRejected(ack.rejected);
      this.scheduleFlush();
      return;
    }

    // rejected_unauthorized / rejected_invalid: 恒久拒否。再送ループを避けるため再 flush しない。
  }

  private async applyRejected(rejected: RejectedEntry[]): Promise<void> {
    const remote: unknown[] = [];
    for (const r of rejected) {
      this.acknowledgedVersions.set(r.id, r.version);
      if (r.payload) {
        remote.push(JSON.parse(r.payload));
      } else {
        // GC 済みトゥームストーン: 削除済みとしてローカルから除去する。
        remote.push({
          id: r.id,
          type: r.type,
          version: r.version,
          versionNonce: r.versionNonce,
          isDeleted: true,
        });
      }
    }
    await this.applyRemote(remote);
  }

  private scheduleFlush(): void {
    if (this.flushScheduled || !this.canEdit) return;
    this.flushScheduled = true;
    setTimeout(() => {
      this.flushScheduled = false;
      this.flush();
    }, FLUSH_THROTTLE_MS);
  }

  private flush(): void {
    if (this.disposed || !this.canEdit) return;
    if (this.socket?.readyState !== WebSocket.OPEN) return; // 切断中は保持
    if (this.inFlight) return; // 1 バッチずつ

    const scene = this.api.getSceneElementsIncludingDeleted();
    const pending: unknown[] = [];
    const versions = new Map<string, number>();
    for (const el of scene) {
      const e = el as unknown as SceneElement;
      if (this.acknowledgedVersions.get(e.id) !== e.version) {
        pending.push(el);
        versions.set(e.id, e.version);
        if (pending.length >= MAX_BATCH_ELEMENTS) break;
      }
    }
    if (pending.length === 0) return;

    const clientUpdateId = crypto.randomUUID();
    this.inFlight = { clientUpdateId, versions };
    this.socket.send(
      JSON.stringify({
        type: "SCENE_UPDATE",
        clientUpdateId,
        elements: pending,
      }),
    );
  }
}
