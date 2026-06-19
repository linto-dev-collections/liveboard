"use client";

import { useForm } from "@tanstack/react-form";
import { toast } from "sonner";
import z from "zod";
import { authClient } from "@/lib/auth-client";

export function useProfileForm(currentName: string) {
  return useForm({
    defaultValues: {
      name: currentName,
    },
    onSubmit: async ({ value }) => {
      const { error } = await authClient.updateUser({
        name: value.name,
      });
      if (error) {
        toast.error(error.message ?? "プロフィールの更新に失敗しました");
        return;
      }
      toast.success("プロフィールを更新しました");
    },
    validators: {
      onSubmit: z.object({
        name: z.string().min(1, "名前を入力してください").max(100),
      }),
    },
  });
}
