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
import { MailIcon } from "lucide-react";
import Link from "next/link";

import { useForgotPasswordForm } from "./use-form";

export function ForgotPasswordForm() {
  const { form, sent } = useForgotPasswordForm();

  if (sent) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader className="items-center justify-items-center text-center">
          <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-full bg-primary/10">
            <MailIcon className="size-6 text-primary" />
          </div>
          <CardTitle className="text-2xl">メールを送信しました</CardTitle>
          <CardDescription>
            パスワードリセット用のリンクをメールで送信しました。
            <br />
            メール内のリンクをクリックして、新しいパスワードを設定してください。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center">
            <Link
              href="/sign-in"
              className="text-muted-foreground text-sm underline-offset-4 hover:underline"
            >
              ログインページに戻る
            </Link>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">パスワードをお忘れですか？</CardTitle>
        <CardDescription>
          登録済みのメールアドレスを入力してください。パスワードリセット用のリンクをお送りします。
        </CardDescription>
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

          <form.Subscribe
            selector={(state) => [state.canSubmit, state.isSubmitting] as const}
          >
            {([canSubmit, isSubmitting]) => (
              <Button
                type="submit"
                className="w-full"
                disabled={!canSubmit || isSubmitting}
              >
                {isSubmitting ? "送信中..." : "リセットリンクを送信"}
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
