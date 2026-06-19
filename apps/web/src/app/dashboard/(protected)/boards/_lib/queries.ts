import { createServerApi } from "@/lib/api.server";
import { type ApiResult, handleApiResponse } from "@/lib/handle-api-response";
import type { BoardListItem, BoardSort } from "./types";

/**
 * ボード一覧を取得（server-side）。前方一致 q・お気に入り絞り込み・並び替えは
 * すべてサーバ側（D1 クエリ）で処理する。`favorite` は z.coerce.boolean の仕様上
 * 「true のときだけ送る（false は省略）」ことで誤検知を避ける。
 */
export async function getBoards(params: {
  q: string;
  favorite: boolean;
  sort: BoardSort;
}): Promise<ApiResult<{ boards: BoardListItem[] }>> {
  const api = await createServerApi();
  const res = await api.api.boards.$get({
    query: {
      sort: params.sort,
      ...(params.q ? { q: params.q } : {}),
      ...(params.favorite ? { favorite: "true" } : {}),
    },
  });
  return handleApiResponse<{ boards: BoardListItem[] }>(res);
}
