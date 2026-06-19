import { env } from "@liveboard/env/web";
import { notFound } from "next/navigation";
import { BoardCanvas } from "../_features/board-canvas";
import { getBoard } from "../_lib/queries";

/**
 * ボードのキャンバス。**サーバ側で role/存在を解決**して board-canvas に渡す
 * （クライアントで権限判定しない）。他組織/非メンバー/不存在は API が 404 を返す。
 */
export async function BoardCanvasContainer({ boardId }: { boardId: string }) {
  const result = await getBoard(boardId);
  if (!result.success) {
    notFound();
  }

  return (
    <BoardCanvas
      boardId={boardId}
      serverUrl={env.NEXT_PUBLIC_SERVER_URL}
      role={result.data.effectiveRole}
    />
  );
}
