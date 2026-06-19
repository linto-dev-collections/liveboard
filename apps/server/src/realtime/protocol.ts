import { z } from "zod";
import type {
  CommentThreadView,
  CommentView,
  NotificationView,
} from "../domain/types/comment";
import { MAX_BATCH_ELEMENTS, MAX_STRING_LEN } from "./limits";

/**
 * WS プロトコル（DO 受信検証 N2/H3）。`@liveboard/shared/schemas` には置かない
 * （dep-cruiser「shared/schemas は routes 専用」）。realtime 層内で完結させる。
 *
 * Excalidraw の要素フォーマット互換を壊さないため、要素は **必須キー・型・長さのみ厳格**に
 * 検証し、残りのキーは loose で保持する（payload として丸ごと保存・配信するため）。
 */
export const elementSchema = z.looseObject({
  id: z.string().min(1).max(MAX_STRING_LEN),
  type: z.string().min(1).max(64),
  version: z.number().int().nonnegative(),
  versionNonce: z.number().int(),
  // fractional index（未配置要素では null/未設定の場合がある）
  index: z.string().max(MAX_STRING_LEN).nullish(),
  isDeleted: z.boolean().optional(),
  // 画像のみ。payload から抽出する（I3/F3）
  fileId: z.string().max(MAX_STRING_LEN).nullish(),
});
export type ProtocolElement = z.infer<typeof elementSchema>;

/** クライアント→サーバ: 要素バッチの durable 更新。 */
export const sceneUpdateSchema = z.object({
  type: z.literal("SCENE_UPDATE"),
  // 冪等キー（クライアントが crypto.randomUUID で採番する不透明キー）。
  clientUpdateId: z.string().min(1).max(128),
  // 空バッチ拒否・要素数上限（H3）。バッチ内 ID 重複は DO でさらに検査する。
  elements: z.array(elementSchema).min(1).max(MAX_BATCH_ELEMENTS),
});
export type SceneUpdateMessage = z.infer<typeof sceneUpdateSchema>;

/** クライアント→サーバ: revision ギャップ回復の再同期要求。 */
export const resyncRequestSchema = z.object({
  type: z.literal("RESYNC_REQUEST"),
  fromRevision: z.number().int().nonnegative().optional(),
});

// ---- 揮発（volatile）メッセージ（Phase 3・durable とは別扱い） ----
// 永続化しない・server_revision を進めない・ACK しない。検証は軽量で、
// なりすまし防止のため username/color/socketId は DO が接続 state から付与する
// （クライアント申告値は使わない）。サイズは onMessage で MAX_PRESENCE_BYTES に制限する。

/** カーソル座標（シーン座標系）。Excalidraw `CollaboratorPointer` 互換。 */
const presencePointerSchema = z.object({
  x: z.number(),
  y: z.number(),
  tool: z.enum(["pointer", "laser"]),
});

/** クライアント→サーバ: ライブカーソル/選択共有。 */
export const mouseLocationSchema = z.object({
  type: z.literal("MOUSE_LOCATION"),
  pointer: presencePointerSchema,
  button: z.enum(["down", "up"]),
  // 選択中要素 ID 集合（Excalidraw appState.selectedElementIds）。サイズは presence 上限で抑止。
  selectedElementIds: z.record(z.string(), z.boolean()).optional(),
});

/** クライアント→サーバ: アイドル状態の共有。 */
export const idleStatusSchema = z.object({
  type: z.literal("IDLE_STATUS"),
  userState: z.enum(["active", "idle", "away"]),
});

/** クライアント→サーバ メッセージ（discriminated union）。 */
export const clientMessageSchema = z.discriminatedUnion("type", [
  sceneUpdateSchema,
  resyncRequestSchema,
  mouseLocationSchema,
  idleStatusSchema,
]);
export type ClientMessage = z.infer<typeof clientMessageSchema>;

// ---- サーバ→クライアント メッセージ（送信のみ・型定義） ----

export type AckStatus =
  | "accepted"
  | "already_applied"
  | "conflict"
  | "rejected_unauthorized"
  | "rejected_invalid";

export type AcceptedEntry = {
  id: string;
  version: number;
  versionNonce: number;
};

export type RejectedEntry = {
  id: string;
  version: number;
  versionNonce: number;
  isDeleted: boolean;
  type: string;
  /** GC 済みトゥームストーンは null。 */
  payload: string | null;
};

/** カーソル座標（サーバ→クライアント）。 */
export type PresencePointer = {
  x: number;
  y: number;
  tool: "pointer" | "laser";
};

/** 参加者の本人性（DO が接続 state から付与・なりすまし不能）。 */
export type ParticipantInfo = {
  socketId: string;
  userId: string;
  username: string;
  /** userId から決定論的に割り当てた識別色（hex）。 */
  color: string;
  /** プロフィール画像 URL（presence アバター用・未設定なら省略）。 */
  image?: string;
};

// ---- コメント・通知（Phase 5・D1 が正本・DO は配信のみ） ----

export type CommentEventKind =
  | "thread_created"
  | "comment_added"
  | "comment_updated"
  | "comment_deleted"
  | "thread_resolved";

/** サーバ→クライアント: コメント/スレッドのリアルタイム反映（参加者全員へ配信）。 */
export type CommentMessage = {
  type: "COMMENT";
  event: CommentEventKind;
  /** thread_created / thread_resolved: スレッド全体。 */
  thread?: CommentThreadView;
  /** comment_added / comment_updated: 対象コメント。 */
  comment?: CommentView;
  /** comment_deleted: 対象 ID（threadDeleted のときスレッドごと消えた）。 */
  threadId?: string;
  commentId?: string;
  threadDeleted?: boolean;
};

/** サーバ→クライアント: 被メンションへの即時通知（該当接続のみへ push）。 */
export type NotificationMessage = {
  type: "NOTIFICATION";
  notification: NotificationView;
};

/**
 * route → DO（RPC）のコメント配信依頼。route が D1 へ永続化した後に、
 * `getServerByName(env.Board, boardId).broadcastCommentEvent(...)` で渡す。
 */
export type CommentBroadcast = {
  /** 参加者全員へ配信する COMMENT 本体。 */
  message: CommentMessage;
  /** オンライン即時通知の対象 userId（被メンション・actor 除外済み）。 */
  notifyUserIds: string[];
  /** 上記宛に push する NOTIFICATION 本体（対象なしのとき null）。 */
  notification: NotificationMessage | null;
};

export type ServerMessage =
  | { type: "SCENE_INIT"; serverRevision: number; elements: unknown[] }
  | { type: "SCENE_UPDATE"; serverRevision: number; elements: unknown[] }
  | { type: "RESYNC"; serverRevision: number; elements: unknown[] }
  | CommentMessage
  | NotificationMessage
  | {
      type: "ACK";
      clientUpdateId: string;
      status: AckStatus;
      serverRevision: number;
      accepted: AcceptedEntry[];
      rejected: RejectedEntry[];
    }
  | { type: "ERROR"; code: string; message: string }
  // 揮発: ライブカーソル/選択/アイドル。identity 4 項目は DO が付与する。
  | (ParticipantInfo & {
      type: "PRESENCE";
      pointer?: PresencePointer;
      button?: "down" | "up";
      selectedElementIds?: Record<string, boolean>;
      userState?: "active" | "idle" | "away";
    })
  // 揮発: 参加者の入退室と初期ロスター。
  | { type: "PARTICIPANTS"; action: "join"; participant: ParticipantInfo }
  | { type: "PARTICIPANTS"; action: "leave"; socketId: string }
  | {
      type: "PARTICIPANTS";
      action: "init";
      self: ParticipantInfo;
      participants: ParticipantInfo[];
    };
