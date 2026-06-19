"use client";

import { useForm } from "@tanstack/react-form";
import { useState } from "react";
import { toast } from "sonner";
import z from "zod";
import { authClient } from "@/lib/auth-client";

export function useResetPasswordForm(token: string) {
  const [success, setSuccess] = useState(false);

  const form = useForm({
    defaultValues: {
      password: "",
      confirmPassword: "",
    },
    onSubmit: async ({ value }) => {
      const { error } = await authClient.resetPassword({
        newPassword: value.password,
        token,
      });
      if (error) {
        toast.error(error.message || "パスワードのリセットに失敗しました");
        return;
      }
      setSuccess(true);
    },
    validators: {
      onSubmit: z
        .object({
          password: z
            .string()
            .min(8, "パスワードは8文字以上で入力してください"),
          confirmPassword: z.string(),
        })
        .refine((data) => data.password === data.confirmPassword, {
          message: "パスワードが一致しません",
          path: ["confirmPassword"],
        }),
    },
  });

  return { form, success };
}
