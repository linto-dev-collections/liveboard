export type ApiResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

const FALLBACK_MESSAGES: Record<number, string> = {
  401: "再度ログインしてください",
  403: "この操作を行う権限がありません",
  404: "リソースが見つかりません",
};

type ResponseLike = {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
};

export async function handleApiResponse<T>(
  res: ResponseLike,
): Promise<ApiResult<T>> {
  const body = await res.json().catch(() => null);

  if (res.ok) {
    return { success: true, data: body as T };
  }

  const serverError = (body as { error?: string } | null)?.error;

  return {
    success: false,
    error:
      serverError ||
      FALLBACK_MESSAGES[res.status as number] ||
      "予期しないエラーが発生しました",
  };
}
