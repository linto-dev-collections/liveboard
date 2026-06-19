/**
 * リアルタイム層の上限・保持期間の定数（overview §6 の確定値を集約）。
 * 負荷試験で調整する単一の置き場所。
 */

/** durable 更新メッセージ 1 件の最大バイト数（要件 §4 / N4）。 */
export const MAX_DURABLE_BYTES = 256 * 1024;

/** presence メッセージの最大バイト数（Phase 3 で使用・N4）。 */
export const MAX_PRESENCE_BYTES = 16 * 1024;

/** 接続 state（setState）の最小限上限（プラットフォーム上限・N5）。 */
export const MAX_CONNECTION_STATE_BYTES = 2 * 1024;

/** ボードあたりの要素数上限（アプリ上限・N4）。 */
export const MAX_ELEMENTS_PER_BOARD = 10_000;

/** 1 メッセージ（バッチ）の要素数上限。 */
export const MAX_BATCH_ELEMENTS = 2_000;

/** 文字列フィールド（id/type/index/fileId 等）の最大長。 */
export const MAX_STRING_LEN = 4_096;

/** トゥームストーン GC 保持期間（テーブル §5.3 / M5）。30 日。 */
export const TOMBSTONE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

/** processed_update（冪等）TTL（テーブル §5.3 / H1）。24 時間。 */
export const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

/** GC alarm の間隔。1 時間ごと。 */
export const GC_ALARM_INTERVAL_MS = 60 * 60 * 1000;

/** D1 `board.last_activity_at` のデバウンス間隔（§5.5/§8.4）。 */
export const ACTIVITY_DEBOUNCE_MS = 30 * 1000;

/** DO SQLite のスキーマ版（§5.4・別系統マイグレーション）。 */
export const DO_SCHEMA_VERSION = 1;

// --- Phase 6: ガバナンス（失効切断・削除 Saga・GC）の上限/保持期間 ---

/**
 * 失効切断（M7）の**期限付き再認可**の有効期間。durable 更新時に期限切れなら DO が
 * D1 から effective role を再取得し、降格/退会を最大この時間で反映する。60 秒。
 */
export const AUTHZ_REAUTH_TTL_MS = 60 * 1000;

/** 削除 Saga のリース有効期間（H4・1 ワーカーが 1 ステップを完了するのに十分な時間）。2 分。 */
export const DELETION_LEASE_TTL_MS = 2 * 60 * 1000;

/** 削除 Saga の最大試行回数（超過で `failed`＝運用通知）。 */
export const DELETION_MAX_ATTEMPTS = 5;

/** 削除 Saga 失敗時の再試行バックオフ。1 分。 */
export const DELETION_RETRY_BACKOFF_MS = 60 * 1000;

/**
 * アセット GC の最小経過時間（I4）。アップロード直後で要素同期前の画像を誤回収しないため、
 * 作成からこの時間が経つまで候補化しない。1 時間。
 */
export const ASSET_GC_MIN_AGE_MS = 60 * 60 * 1000;

/** アセット GC の猶予期間（§8.3）。候補化からこの期間は削除せず、再参照で候補解除。7 日。 */
export const ASSET_GC_GRACE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * 孤児回収（G6）の最小経過時間。manifest に無い R2 オブジェクトでも、アップロード直後の
 * レースを避けるため作成からこの時間が経過したもののみ回収する。1 時間。
 */
export const ORPHAN_MIN_AGE_MS = 60 * 60 * 1000;

/** 1 回の scheduled 実行で処理する GC/孤児回収の最大件数（暴走防止）。 */
export const MAINTENANCE_BATCH_LIMIT = 500;

/** 1 回の scheduled 実行で進める削除ジョブの最大数（暴走防止）。 */
export const DELETION_JOBS_PER_TICK = 20;
