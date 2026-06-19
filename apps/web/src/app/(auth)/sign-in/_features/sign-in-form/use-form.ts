"use client";

import { useForm } from "@tanstack/react-form";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import z from "zod";
import { authClient } from "@/lib/auth-client";

/**
 * callbackUrl が外部 URL / protocol-relative ("//evil.com/...") の場合は
 * 無視してデフォルトに倒す。open redirect の防止。
 */
function safeInternalPath(url: string | undefined, fallback: string): string {
  if (!url?.startsWith("/") || url.startsWith("//")) return fallback;
  return url;
}

export function useSignInForm(callbackUrl?: string) {
  const router = useRouter();

  return useForm({
    defaultValues: {
      email: "",
      password: "",
    },
    onSubmit: async ({ value }) => {
      await authClient.signIn.email(
        {
          email: value.email,
          password: value.password,
        },
        {
          onSuccess: async () => {
            try {
              const { data: session } = await authClient.getSession();
              if (session && !session.session.activeOrganizationId) {
                const { data: orgs } = await authClient.organization.list();
                if (Array.isArray(orgs) && orgs.length > 0) {
                  await authClient.organization.setActive({
                    organizationId: orgs[0].id,
                  });
                }
              }
            } catch (e) {
              console.error("[sign-in] Failed to set active organization:", e);
            }
            toast.success("ログインしました");
            router.push(
              safeInternalPath(callbackUrl, "/dashboard") as "/dashboard",
            );
          },
          onError: (error) => {
            if (error.error.status === 403) {
              router.push(
                `/check-email?email=${encodeURIComponent(value.email)}`,
              );
              return;
            }
            toast.error(error.error.message || error.error.statusText);
          },
        },
      );
    },
    validators: {
      onSubmit: z.object({
        email: z.email("有効なメールアドレスを入力してください"),
        password: z.string().min(8, "パスワードは8文字以上で入力してください"),
      }),
    },
  });
}
