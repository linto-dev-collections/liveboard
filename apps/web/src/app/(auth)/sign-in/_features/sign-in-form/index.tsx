"use client";

import { Badge } from "@liveboard/ui/components/ui/badge";
import { Button } from "@liveboard/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@liveboard/ui/components/ui/card";
import { Input } from "@liveboard/ui/components/ui/input";
import { Label } from "@liveboard/ui/components/ui/label";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { SocialSignIn } from "../../../_features/social-sign-in";
import { useSignInForm } from "./use-form";

export function SignInForm() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? undefined;
  const form = useSignInForm(callbackUrl);
  // 前回 email/password でログインしていたら「メールアドレス」ラベル横にヒントを出す。
  // SSR では cookie が読めず null になるため、mount 後に state を埋めて
  // hydration mismatch を避ける。
  const [showLastUsedBadge, setShowLastUsedBadge] = useState(false);
  useEffect(() => {
    setShowLastUsedBadge(authClient.getLastUsedLoginMethod() === "email");
  }, []);

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">ログイン</CardTitle>
        <CardDescription>liveboard にログインしましょう。</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <SocialSignIn callbackUrl={callbackUrl} context="sign-in" />

        <form
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            form.handleSubmit();
          }}
          className="space-y-4"
        >
          <form.Field name="email">
            {(field) => (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor={field.name}>メールアドレス</Label>
                  {showLastUsedBadge && (
                    <Badge variant="secondary">前回利用</Badge>
                  )}
                </div>
                <Input
                  id={field.name}
                  name={field.name}
                  type="email"
                  autoComplete="email"
                  aria-invalid={field.state.meta.errors.length > 0}
                  aria-describedby={
                    field.state.meta.errors.length > 0
                      ? `${field.name}-error`
                      : undefined
                  }
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                />
                {field.state.meta.errors.length > 0 && (
                  <p
                    id={`${field.name}-error`}
                    className="text-destructive text-sm"
                  >
                    {field.state.meta.errors[0]?.message}
                  </p>
                )}
              </div>
            )}
          </form.Field>

          <form.Field name="password">
            {(field) => (
              <div className="space-y-2">
                <Label htmlFor={field.name}>パスワード</Label>
                <Input
                  id={field.name}
                  name={field.name}
                  type="password"
                  autoComplete="current-password"
                  aria-invalid={field.state.meta.errors.length > 0}
                  aria-describedby={
                    field.state.meta.errors.length > 0
                      ? `${field.name}-error`
                      : undefined
                  }
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                />
                {field.state.meta.errors.length > 0 && (
                  <p
                    id={`${field.name}-error`}
                    className="text-destructive text-sm"
                  >
                    {field.state.meta.errors[0]?.message}
                  </p>
                )}
              </div>
            )}
          </form.Field>

          <div className="text-right">
            <Link
              href="/forgot-password"
              className="text-muted-foreground text-sm underline-offset-4 hover:underline"
            >
              パスワードをお忘れですか？
            </Link>
          </div>

          <form.Subscribe
            selector={(state) => [state.canSubmit, state.isSubmitting] as const}
          >
            {([canSubmit, isSubmitting]) => (
              <Button
                type="submit"
                className="w-full"
                disabled={!canSubmit || isSubmitting}
              >
                {isSubmitting ? "ログイン中..." : "ログイン"}
              </Button>
            )}
          </form.Subscribe>
        </form>

        <div className="text-center text-sm">
          <Link
            href={
              callbackUrl
                ? `/sign-up?callbackUrl=${encodeURIComponent(callbackUrl)}`
                : "/sign-up"
            }
            className="underline-offset-4 hover:underline"
          >
            アカウントをお持ちでないですか？新規登録
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
