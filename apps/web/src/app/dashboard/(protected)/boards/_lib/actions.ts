"use server";

import {
  createBoardSchema,
  renameBoardSchema,
} from "@liveboard/shared/schemas";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createServerApi } from "@/lib/api.server";
import { type ApiResult, handleApiResponse } from "@/lib/handle-api-response";

const idSchema = z.string().min(1, "ボード ID が必要です");

/** ボード作成。成功時は作成された board の id を返し、呼び出し側で遷移する。 */
export async function createBoardAction(
  title: string,
): Promise<ApiResult<{ id: string }>> {
  const parsed = createBoardSchema.safeParse({ title });
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }
  const api = await createServerApi();
  const res = await api.api.boards.$post({ json: parsed.data });
  const result = await handleApiResponse<{
    board: { id: string; title: string };
  }>(res);
  if (!result.success) return { success: false, error: result.error };
  revalidatePath("/dashboard/boards");
  return { success: true, data: { id: result.data.board.id } };
}

/** ボードのリネーム（board owner のみ・サーバ側で M8 検査）。 */
export async function renameBoardAction(
  id: string,
  title: string,
): Promise<ApiResult<void>> {
  const pid = idSchema.safeParse(id);
  if (!pid.success)
    return { success: false, error: pid.error.issues[0].message };
  const parsed = renameBoardSchema.safeParse({ title });
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }
  const api = await createServerApi();
  const res = await api.api.boards[":id"].$patch({
    param: { id },
    json: parsed.data,
  });
  const result = await handleApiResponse<{ success: true }>(res);
  if (!result.success) return { success: false, error: result.error };
  revalidatePath("/dashboard/boards");
  return { success: true, data: undefined };
}

/** ボード削除要求（Saga キュー投入・board owner のみ）。 */
export async function deleteBoardAction(id: string): Promise<ApiResult<void>> {
  const pid = idSchema.safeParse(id);
  if (!pid.success)
    return { success: false, error: pid.error.issues[0].message };
  const api = await createServerApi();
  const res = await api.api.boards[":id"].$delete({ param: { id } });
  const result = await handleApiResponse<{ success: true }>(res);
  if (!result.success) return { success: false, error: result.error };
  revalidatePath("/dashboard/boards");
  return { success: true, data: undefined };
}

/** お気に入りの追加/解除。 */
export async function toggleFavoriteAction(
  id: string,
  favorite: boolean,
): Promise<ApiResult<void>> {
  const pid = idSchema.safeParse(id);
  if (!pid.success)
    return { success: false, error: pid.error.issues[0].message };
  const api = await createServerApi();
  const res = favorite
    ? await api.api.boards[":id"].favorite.$put({ param: { id } })
    : await api.api.boards[":id"].favorite.$delete({ param: { id } });
  const result = await handleApiResponse<{ success: true }>(res);
  if (!result.success) return { success: false, error: result.error };
  revalidatePath("/dashboard/boards");
  return { success: true, data: undefined };
}
