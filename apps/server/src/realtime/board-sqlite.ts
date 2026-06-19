import { DO_SCHEMA_VERSION } from "./limits";
import type { AcceptedEntry, RejectedEntry } from "./protocol";
import { isAccepted, type NormalizedElement, ProtocolError } from "./reconcile";

/**
 * DO SQLite（要素の正本）の DDL・初期化・採用判定・GC（テーブル §5）。
 * drizzle-kit の対象外で、ここで raw SQL として管理する（`room_state.schema_version`
 * で D1 とは別系統のマイグレーション）。
 */

// --- §5.1 DDL ---
const DDL_STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS room_state (
     id              INTEGER PRIMARY KEY CHECK (id = 1),
     board_id        TEXT    NOT NULL,
     server_revision INTEGER NOT NULL DEFAULT 0,
     schema_version  INTEGER NOT NULL DEFAULT 1,
     updated_at      INTEGER NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS element (
     id               TEXT    PRIMARY KEY,
     version          INTEGER NOT NULL,
     version_nonce    INTEGER NOT NULL,
     fractional_index TEXT,
     is_deleted       INTEGER NOT NULL DEFAULT 0 CHECK (is_deleted IN (0,1)),
     type             TEXT    NOT NULL,
     file_id          TEXT,
     payload          TEXT,
     server_revision  INTEGER NOT NULL,
     updated_at       INTEGER NOT NULL,
     CHECK (is_deleted = 1 OR payload IS NOT NULL)
   )`,
  "CREATE INDEX IF NOT EXISTS element_revision_idx ON element (server_revision)",
  "CREATE INDEX IF NOT EXISTS element_file_id_idx ON element (file_id) WHERE is_deleted = 0 AND file_id IS NOT NULL",
  `CREATE TABLE IF NOT EXISTS processed_update (
     client_update_id TEXT    PRIMARY KEY,
     request_hash     TEXT    NOT NULL,
     server_revision  INTEGER NOT NULL,
     result_json      TEXT    NOT NULL,
     created_at       INTEGER NOT NULL
   )`,
  "CREATE INDEX IF NOT EXISTS processed_update_created_idx ON processed_update (created_at)",
];

type RoomStateRow = {
  board_id: string;
  schema_version: number;
  server_revision: number;
};

/**
 * §5.4 初期化（onStart 内で呼ぶ）。
 * 1. DDL 適用 2. room_state(id=1) を未存在なら INSERT
 * 3. DO 識別子（this.name）と保存済み board_id の一致検証（G5・不一致なら起動失敗）
 * 4. schema_version マイグレーション
 */
export function initRoom(sql: SqlStorage, boardId: string, now: number): void {
  for (const ddl of DDL_STATEMENTS) sql.exec(ddl);

  const existing = sql
    .exec<RoomStateRow>(
      "SELECT board_id, schema_version, server_revision FROM room_state WHERE id = 1",
    )
    .toArray()[0];

  if (!existing) {
    sql.exec(
      "INSERT INTO room_state (id, board_id, server_revision, schema_version, updated_at) VALUES (1, ?, 0, ?, ?)",
      boardId,
      DO_SCHEMA_VERSION,
      now,
    );
    return;
  }

  // G5: 誤ルーム接続防止。保存済み board_id と DO のルーム ID が一致しなければ起動失敗。
  if (existing.board_id !== boardId) {
    throw new Error(
      `room_state board_id mismatch: stored=${existing.board_id} expected=${boardId}`,
    );
  }

  runMigrations(sql, existing.schema_version, now);
}

/** schema_version に基づく番号付きマイグレーション（現状 v1 のみ・将来ここに追加）。 */
function runMigrations(
  sql: SqlStorage,
  fromVersion: number,
  now: number,
): void {
  if (fromVersion >= DO_SCHEMA_VERSION) return;
  // 例: for (let v = fromVersion; v < DO_SCHEMA_VERSION; v++) { switch (v) { case 1: sql.exec(...); } }
  sql.exec(
    "UPDATE room_state SET schema_version = ?, updated_at = ? WHERE id = 1",
    DO_SCHEMA_VERSION,
    now,
  );
}

/** 現在の server_revision。 */
export function currentRevision(sql: SqlStorage): number {
  return sql
    .exec<{ server_revision: number }>(
      "SELECT server_revision FROM room_state WHERE id = 1",
    )
    .one().server_revision;
}

/** 正規スナップショット（生存要素を fractional_index 順に）。SCENE_INIT/RESYNC 用。 */
export function snapshotElements(sql: SqlStorage): {
  serverRevision: number;
  elements: unknown[];
} {
  const serverRevision = currentRevision(sql);
  const rows = sql
    .exec<{ payload: string }>(
      "SELECT payload FROM element WHERE is_deleted = 0 AND payload IS NOT NULL ORDER BY fractional_index",
    )
    .toArray();
  const elements = rows.map((r) => JSON.parse(r.payload));
  return { serverRevision, elements };
}

export type ApplyResult = {
  status: "accepted" | "already_applied" | "conflict";
  applied: boolean;
  serverRevision: number;
  accepted: AcceptedEntry[];
  rejected: RejectedEntry[];
};

type ElementRow = {
  version: number;
  version_nonce: number;
  is_deleted: number;
  type: string;
  payload: string | null;
};

/**
 * §5.2 採用判定 + revision 採番（**`transactionSync` 内で同期実行**）。
 * 全件 all-or-nothing：1 件でも不採用ならバッチ全体を適用しない（bound 要素の論理原子性）。
 */
export function applyBatch(
  sql: SqlStorage,
  clientUpdateId: string,
  requestHash: string,
  norm: NormalizedElement[],
  now: number,
): ApplyResult {
  // 1) 冪等性（H1/I5）: 処理済み clientUpdateId は保存済み結果を再返却
  const seen = sql
    .exec<{ request_hash: string; result_json: string }>(
      "SELECT request_hash, result_json FROM processed_update WHERE client_update_id = ?",
      clientUpdateId,
    )
    .toArray()[0];
  if (seen) {
    if (seen.request_hash !== requestHash) {
      throw new ProtocolError("clientUpdateId reused with different payload");
    }
    // I1: 保存結果を再返却するが applied=false（再 broadcast を防ぐ）
    const cached = JSON.parse(seen.result_json) as ApplyResult;
    return { ...cached, status: "already_applied", applied: false };
  }

  const nextRev = currentRevision(sql) + 1;

  // 2) 事前採否判定（version 大／同値は nonce 小）。authoritative 応答に isDeleted/type/payload 同梱（H2）
  const rejected: RejectedEntry[] = [];
  for (const el of norm) {
    const row = sql
      .exec<ElementRow>(
        "SELECT version, version_nonce, is_deleted, type, payload FROM element WHERE id = ?",
        el.id,
      )
      .toArray()[0];
    const accept = isAccepted(
      el,
      row ? { version: row.version, versionNonce: row.version_nonce } : null,
    );
    if (!accept && row) {
      rejected.push({
        id: el.id,
        version: row.version,
        versionNonce: row.version_nonce,
        isDeleted: row.is_deleted === 1,
        type: row.type,
        payload: row.payload,
      });
    }
  }

  const persist = (res: ApplyResult): ApplyResult => {
    sql.exec(
      "INSERT INTO processed_update (client_update_id, request_hash, server_revision, result_json, created_at) VALUES (?,?,?,?,?)",
      clientUpdateId,
      requestHash,
      res.serverRevision,
      JSON.stringify(res),
      now,
    );
    return res;
  };

  // 3) all-or-nothing: 1 件でも不採用ならバッチ全体を適用しない（revision も進めない）
  if (rejected.length > 0) {
    return persist({
      status: "conflict",
      applied: false,
      serverRevision: nextRev - 1,
      accepted: [],
      rejected,
    });
  }

  // 4) 全件採用 → UPSERT（LWW 条件併用＝多重防御 H3）＋ revision 採番
  for (const el of norm) {
    sql.exec(
      `INSERT INTO element (id, version, version_nonce, fractional_index, is_deleted, type, file_id, payload, server_revision, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET
         version=excluded.version, version_nonce=excluded.version_nonce,
         fractional_index=excluded.fractional_index, is_deleted=excluded.is_deleted,
         type=excluded.type, file_id=excluded.file_id, payload=excluded.payload,
         server_revision=excluded.server_revision, updated_at=excluded.updated_at
       WHERE excluded.version > element.version
          OR (excluded.version = element.version AND excluded.version_nonce < element.version_nonce)`,
      el.id,
      el.version,
      el.versionNonce,
      el.fractionalIndex,
      el.isDeleted ? 1 : 0,
      el.type,
      el.fileId,
      el.payload,
      nextRev,
      now,
    );
  }
  sql.exec(
    "UPDATE room_state SET server_revision = ?, updated_at = ? WHERE id = 1",
    nextRev,
    now,
  );
  return persist({
    status: "accepted",
    applied: true,
    serverRevision: nextRev,
    accepted: norm.map((e) => ({
      id: e.id,
      version: e.version,
      versionNonce: e.versionNonce,
    })),
    rejected: [],
  });
}

/** §5.3 トゥームストーン GC（保持期間経過後に payload 等を除去し、版情報は残す）。 */
export function runTombstoneGc(
  sql: SqlStorage,
  now: number,
  retentionMs: number,
): void {
  sql.exec(
    "UPDATE element SET payload = NULL, fractional_index = NULL, file_id = NULL, updated_at = ? WHERE is_deleted = 1 AND payload IS NOT NULL AND updated_at < ?",
    now,
    now - retentionMs,
  );
}

/** processed_update の GC（H1・TTL は再送猶予より長く）。 */
export function runProcessedUpdateGc(
  sql: SqlStorage,
  now: number,
  ttlMs: number,
): void {
  sql.exec("DELETE FROM processed_update WHERE created_at < ?", now - ttlMs);
}

/**
 * 削除 Saga（§8.1）用: DO SQLite の全データを消去する。`deleteAll()` は SQLite-backed DO で
 * 使えない実行環境があるため、明示的に各テーブルを空にする（purge() RPC から呼ぶ）。
 */
export function purgeRoom(sql: SqlStorage): void {
  sql.exec("DELETE FROM element");
  sql.exec("DELETE FROM processed_update");
  sql.exec("DELETE FROM room_state");
}

/**
 * アセット GC（I4）用: 指定 fileId のうち**生存要素から参照されている**ものを返す。
 * `element_file_id_idx`（is_deleted=0 ∧ file_id NOT NULL の部分索引）を引く。
 */
export function liveFileRefs(sql: SqlStorage, fileIds: string[]): string[] {
  if (fileIds.length === 0) return [];
  const placeholders = fileIds.map(() => "?").join(",");
  const rows = sql
    .exec<{ file_id: string }>(
      `SELECT DISTINCT file_id FROM element
       WHERE is_deleted = 0 AND file_id IS NOT NULL AND file_id IN (${placeholders})`,
      ...fileIds,
    )
    .toArray();
  return rows.map((r) => r.file_id);
}
