import { createServerApi } from "@/lib/api.server";
import { type ApiResult, handleApiResponse } from "@/lib/handle-api-response";

export type BoardDetail = {
  board: {
    id: string;
    title: string;
    deletionState: "active" | "purging";
  };
  effectiveRole: "owner" | "editor" | "viewer";
};

/** ボード詳細を取得（他組織/非メンバー/不存在は API 側で 404）。 */
export async function getBoard(id: string): Promise<ApiResult<BoardDetail>> {
  const api = await createServerApi();
  const res = await api.api.boards[":id"].$get({ param: { id } });
  return handleApiResponse<BoardDetail>(res);
}
