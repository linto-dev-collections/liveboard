"use client";

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
import { SocialSignIn } from "../../../_features/social-sign-in";
import { useSignUpForm } from "./use-form";

export function SignUpForm() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? undefined;
  const form = useSignUpForm();

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">アカウント作成</CardTitle>
        <CardDescription>
          メールアドレスまたは Google で liveboard をはじめましょう。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <SocialSignIn callbackUrl={callbackUrl} context="sign-up" />

        <form
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            form.handleSubmit();
          }}
          className="space-y-4"
        >
          <form.Field name="name">
            {(field) => (
              <div className="space-y-2">
                <Label htmlFor={field.name}>名前</Label>
                <Input
                  id={field.name}
                  name={field.name}
                  autoComplete="name"
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

          <form.Field name="email">
            {(field) => (
              <div className="space-y-2">
                <Label htmlFor={field.name}>メールアドレス</Label>
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
            {(field) => {
              const meetsLength = field.state.value.length >= 8;
              return (
                <div className="space-y-2">
                  <Label htmlFor={field.name}>パスワード</Label>
                  <Input
                    id={field.name}
                    name={field.name}
                    type="password"
                    autoComplete="new-password"
                    aria-invalid={field.state.meta.errors.length > 0}
                    aria-describedby={`${field.name}-requirements${field.state.meta.errors.length > 0 ? ` ${field.name}-error` : ""}`}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                  />
                  <p
                    id={`${field.name}-requirements`}
                    className="text-muted-foreground text-xs"
                  >
                    <span
                      className={
                        meetsLength ? "text-success" : "text-muted-foreground"
                      }
                      aria-hidden
                    >
                      {meetsLength ? "✓" : "○"}
                    </span>
                    <span className="ml-1">8 文字以上</span>
                  </p>
                  {field.state.meta.errors.length > 0 && (
                    <p
                      id={`${field.name}-error`}
                      className="text-destructive text-sm"
                    >
                      {field.state.meta.errors[0]?.message}
                    </p>
                  )}
                </div>
              );
            }}
          </form.Field>

          <form.Subscribe
            selector={(state) => [state.canSubmit, state.isSubmitting] as const}
          >
            {([canSubmit, isSubmitting]) => (
              <Button
                type="submit"
                className="w-full"
                disabled={!canSubmit || isSubmitting}
              >
                {isSubmitting ? "登録中..." : "新規登録"}
              </Button>
            )}
          </form.Subscribe>
        </form>

        <div className="text-center text-sm">
          <Link
            href={
              callbackUrl
                ? `/sign-in?callbackUrl=${encodeURIComponent(callbackUrl)}`
                : "/sign-in"
            }
            className="underline-offset-4 hover:underline"
          >
            すでにアカウントをお持ちですか？ログイン
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
