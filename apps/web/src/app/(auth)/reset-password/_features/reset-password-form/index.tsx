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
import { CheckCircle2Icon, XCircleIcon } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { useResetPasswordForm } from "./use-form";

export function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const error = searchParams.get("error");

  if (!token || error) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader className="items-center justify-items-center text-center">
          <XCircleIcon className="mx-auto mb-2 size-10 text-destructive" />
          <CardTitle className="text-2xl">
            リセットリンクが無効または期限切れです
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-2">
            <Button
              className="w-full"
              nativeButton={false}
              render={<Link href="/forgot-password" />}
            >
              リセットリンクを再送する
            </Button>
            <div className="text-center">
              <Link
                href="/sign-in"
                className="text-muted-foreground text-sm underline-offset-4 hover:underline"
              >
                ログインページに戻る
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return <ResetPasswordFormInner token={token} />;
}

function ResetPasswordFormInner({ token }: { token: string }) {
  const { form, success } = useResetPasswordForm(token);

  if (success) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader className="items-center justify-items-center text-center">
          <CheckCircle2Icon className="mx-auto mb-2 size-10 text-success" />
          <CardTitle className="text-2xl">パスワードが変更されました</CardTitle>
        </CardHeader>
        <CardContent>
          <Button
            className="w-full"
            nativeButton={false}
            render={<Link href="/sign-in" />}
          >
            ログインページへ
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">新しいパスワードを設定</CardTitle>
        <CardDescription>新しいパスワードを入力してください。</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            form.handleSubmit();
          }}
          className="space-y-4"
        >
          <form.Field name="password">
            {(field) => {
              const meetsLength = field.state.value.length >= 8;
              return (
                <div className="space-y-2">
                  <Label htmlFor={field.name}>新しいパスワード</Label>
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

          <form.Field name="confirmPassword">
            {(field) => (
              <div className="space-y-2">
                <Label htmlFor={field.name}>パスワードの確認</Label>
                <Input
                  id={field.name}
                  name={field.name}
                  type="password"
                  autoComplete="new-password"
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

          <form.Subscribe
            selector={(state) => [state.canSubmit, state.isSubmitting] as const}
          >
            {([canSubmit, isSubmitting]) => (
              <Button
                type="submit"
                className="w-full"
                disabled={!canSubmit || isSubmitting}
              >
                {isSubmitting ? "変更中..." : "パスワードを変更"}
              </Button>
            )}
          </form.Subscribe>
        </form>

        <div className="text-center text-sm">
          <Link href="/sign-in" className="underline-offset-4 hover:underline">
            ログインページに戻る
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
