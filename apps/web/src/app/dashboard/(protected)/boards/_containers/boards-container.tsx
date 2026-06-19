import { BoardsView } from "../_features/boards-view";
import { getBoards } from "../_lib/queries";
import type { BoardSort } from "../_lib/types";

/**
 * ボード一覧の Server Container。searchParams（q/favorite/sort）に基づき
 * server-side で一覧を取得し、view に渡す。toolbar が URL state を
 * `shallow: false` で変更すると本 Container が再実行され、再取得される。
 */
export async function BoardsContainer({
  q,
  favorite,
  sort,
}: {
  q: string;
  favorite: boolean;
  sort: BoardSort;
}) {
  const result = await getBoards({ q, favorite, sort });

  if (!result.success) {
    return <p className="text-muted-foreground text-sm">{result.error}</p>;
  }

  return <BoardsView boards={result.data.boards} />;
}
