"use client";

import { useForm } from "@tanstack/react-form";
import { toast } from "sonner";
import z from "zod";
import { inviteMember } from "../../../../_lib/actions";

export function useInviteMemberForm(onSuccess?: () => void) {
  return useForm({
    defaultValues: {
      email: "",
      role: "member" as "member" | "admin",
    },
    onSubmit: async ({ value }) => {
      const result = await inviteMember(value.email, value.role);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(`${value.email} に招待を送信しました`);
      onSuccess?.();
    },
    validators: {
      onSubmit: z.object({
        email: z.email("有効なメールアドレスを入力してください"),
        role: z.enum(["member", "admin"]),
      }),
    },
  });
}
