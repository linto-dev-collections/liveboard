"use client";

import { useForm } from "@tanstack/react-form";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { z } from "zod";
import { createBoardAction } from "../../_lib/actions";

/**
 * ボード作成フォーム。タイトル未入力なら "Untitled" で作成し、
 * 成功時は作成されたボードの詳細（Phase 2 のキャンバス）へ遷移する。
 */
export function useCreateBoardForm(onSuccess?: () => void) {
  const router = useRouter();
  return useForm({
    defaultValues: {
      title: "",
    },
    onSubmit: async ({ value }) => {
      const result = await createBoardAction(value.title.trim() || "Untitled");
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("ボードを作成しました");
      onSuccess?.();
      router.push(`/dashboard/boards/${result.data.id}`);
    },
    validators: {
      onSubmit: z.object({
        title: z
          .string()
          .trim()
          .max(100, "タイトルは 100 文字以内で入力してください"),
      }),
    },
  });
}
