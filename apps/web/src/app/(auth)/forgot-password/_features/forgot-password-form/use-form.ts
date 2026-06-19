"use client";

import { useForm } from "@tanstack/react-form";
import { useState } from "react";
import z from "zod";
import { authClient } from "@/lib/auth-client";

export function useForgotPasswordForm() {
  const [sent, setSent] = useState(false);

  const form = useForm({
    defaultValues: {
      email: "",
    },
    onSubmit: async ({ value }) => {
      await authClient.requestPasswordReset({
        email: value.email,
        redirectTo: "/reset-password",
      });
      // Always show success to prevent email enumeration
      setSent(true);
    },
    validators: {
      onSubmit: z.object({
        email: z.email("有効なメールアドレスを入力してください"),
      }),
    },
  });

  return { form, sent };
}
