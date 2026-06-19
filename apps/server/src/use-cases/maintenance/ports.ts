/**
 * メンテナンス use-case が依存する **Board DO ゲートウェイのポート**（依存性逆転）。
 *
 * dep-cruiser 上 `use-cases/` は `realtime/`（Board DO）を import できない（type-only でも禁止）。
 * そのため Saga/GC は DO スタブを直接触らず、このポート越しに DO を呼ぶ。実装は composition root
 * （`src/maintenance.ts`）が `getServerByName(env.Board, ...)` を使って注入する。
 */
export type BoardMaintenanceGateway = {
  /** 削除 Saga（§8.1）: Board DO の SQLite を全消去し、既存接続を強制切断する。 */
  purge(boardId: string): Promise<void>;
  /** アセット GC（I4）: 指定 fileId のうち**生存要素から参照中**のものを返す。 */
  hasLiveFileRefs(boardId: string, fileIds: string[]): Promise<string[]>;
};

/** boardId をキーに行をまとめる（GC の DO 照合をボード単位でバッチ化するため）。 */
export function groupByBoard<T extends { boardId: string }>(
  rows: T[],
): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const list = map.get(row.boardId);
    if (list) list.push(row);
    else map.set(row.boardId, [row]);
  }
  return map;
}
