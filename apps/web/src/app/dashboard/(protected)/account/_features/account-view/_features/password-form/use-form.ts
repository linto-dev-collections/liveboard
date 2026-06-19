"use client";

import { useForm } from "@tanstack/react-form";
import { toast } from "sonner";
import z from "zod";
import { authClient } from "@/lib/auth-client";

const errorMessages: Record<string, string> = {
  INVALID_PASSWORD: "現在のパスワードが正しくありません",
  CREDENTIAL_ACCOUNT_NOT_FOUND: "パスワードが設定されていないアカウントです",
};

function getErrorMessage(error: { code?: string; message?: string }): string {
  if (error.code && error.code in errorMessages) {
    return errorMessages[error.code];
  }
  return error.message ?? "パスワードの変更に失敗しました";
}

export function usePasswordForm() {
  return useForm({
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
    onSubmit: async ({ value, formApi }) => {
      if (value.newPassword !== value.confirmPassword) {
        toast.error("パスワードが一致しません");
        return;
      }
      const { error } = await authClient.changePassword({
        currentPassword: value.currentPassword,
        newPassword: value.newPassword,
        revokeOtherSessions: false,
      });
      if (error) {
        toast.error(getErrorMessage(error));
        return;
      }
      formApi.reset();
      toast.success("パスワードを変更しました");
    },
    validators: {
      onSubmit: z.object({
        currentPassword: z
          .string()
          .min(1, "現在のパスワードを入力してください"),
        newPassword: z
          .string()
          .min(8, "パスワードは8文字以上で入力してください"),
        confirmPassword: z
          .string()
          .min(1, "確認用パスワードを入力してください"),
      }),
    },
  });
}
