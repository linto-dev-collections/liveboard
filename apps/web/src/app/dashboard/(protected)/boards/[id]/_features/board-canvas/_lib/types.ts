/**
 * WS プロトコル型（サーバ `apps/server/src/realtime/protocol.ts` と整合する手書き型）。
 */

export type BoardRole = "owner" | "editor" | "viewer";

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

/** サーバ → クライアント。 */
export type ServerToClient =
  | { type: "SCENE_INIT"; serverRevision: number; elements: unknown[] }
  | { type: "SCENE_UPDATE"; serverRevision: number; elements: unknown[] }
  | { type: "RESYNC"; serverRevision: number; elements: unknown[] }
  | {
      type: "ACK";
      clientUpdateId: string;
      status: AckStatus;
      serverRevision: number;
      accepted: AcceptedEntry[];
      rejected: RejectedEntry[];
    }
  | { type: "ERROR"; code: string; message: string };

/** クライアント → サーバ。 */
export type ClientToServer =
  | { type: "SCENE_UPDATE"; clientUpdateId: string; elements: unknown[] }
  | { type: "RESYNC_REQUEST"; fromRevision?: number };

// ---- 揮発（presence）型（Phase 3） ----

export type PresencePointer = {
  x: number;
  y: number;
  tool: "pointer" | "laser";
};

export type UserActivityState = "active" | "idle" | "away";

/** 参加者の本人性（サーバが接続 state から付与。なりすまし不能）。 */
export type ParticipantInfo = {
  socketId: string;
  userId: string;
  username: string;
  /** userId から決定論的に割り当てた識別色（hex）。 */
  color: string;
  /** プロフィール画像 URL（presence アバター用・未設定なら省略）。 */
  image?: string;
};

/** サーバ → クライアント（揮発）。`ServerToClient` とは別経路で処理する。 */
export type PresenceMessage =
  | (ParticipantInfo & {
      type: "PRESENCE";
      pointer?: PresencePointer;
      button?: "down" | "up";
      selectedElementIds?: Record<string, boolean>;
      userState?: UserActivityState;
    })
  | { type: "PARTICIPANTS"; action: "join"; participant: ParticipantInfo }
  | { type: "PARTICIPANTS"; action: "leave"; socketId: string }
  | {
      type: "PARTICIPANTS";
      action: "init";
      self: ParticipantInfo;
      participants: ParticipantInfo[];
    };

/** クライアント → サーバ（揮発）。 */
export type ClientPresenceMessage =
  | {
      type: "MOUSE_LOCATION";
      pointer: PresencePointer;
      button: "down" | "up";
      selectedElementIds?: Record<string, boolean>;
    }
  | { type: "IDLE_STATUS"; userState: UserActivityState };
