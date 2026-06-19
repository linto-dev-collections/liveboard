"use client";

import { Button } from "@liveboard/ui/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@liveboard/ui/components/ui/dialog";
import { Input } from "@liveboard/ui/components/ui/input";
import { Label } from "@liveboard/ui/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@liveboard/ui/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@liveboard/ui/components/ui/tooltip";
import { InfoIcon, PlusIcon } from "lucide-react";
import { useRef } from "react";
import { useInviteMemberForm } from "./use-form";

export function InviteMemberDialog() {
  const closeRef = useRef<HTMLButtonElement>(null);

  const form = useInviteMemberForm(() => {
    closeRef.current?.click();
  });

  return (
    <Dialog>
      <DialogTrigger render={<Button size="sm" />}>
        <PlusIcon className="mr-2 size-4" />
        メンバーを招待
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>メンバーを招待</DialogTitle>
          <DialogDescription>
            招待メールを送信して、組織に新しいメンバーを追加します。
          </DialogDescription>
        </DialogHeader>
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
                  placeholder="member@example.com"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                />
                {field.state.meta.errors.map((error) => (
                  <p key={error?.message} className="text-destructive text-sm">
                    {error?.message}
                  </p>
                ))}
              </div>
            )}
          </form.Field>

          <form.Field name="role">
            {(field) => (
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <Label htmlFor={field.name}>ロール</Label>
                  <Tooltip>
                    <TooltipTrigger
                      type="button"
                      aria-label="ロールの説明"
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <InfoIcon className="size-3.5" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <div className="space-y-2 text-xs">
                        <div>
                          <p className="font-semibold">メンバー</p>
                          <p className="text-background/80">
                            録画の作成・閲覧、メンバー一覧の閲覧のみ。他人の録画やフォルダ・共有リンク・組織設定は変更できません。
                          </p>
                        </div>
                        <div>
                          <p className="font-semibold">管理者</p>
                          <p className="text-background/80">
                            メンバーの権限に加えて、録画・フォルダ・共有リンクの編集と削除、メンバーの招待・削除・ロール変更、Webhook
                            や連携などの組織設定の変更が可能です。組織自体の削除とオーナー権限の譲渡はオーナーのみ。
                          </p>
                        </div>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <Select
                  value={field.state.value}
                  onValueChange={(v) =>
                    v && field.handleChange(v as "member" | "admin")
                  }
                  items={[
                    { value: "member", label: "メンバー" },
                    { value: "admin", label: "管理者" },
                  ]}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="ロールを選択" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="member">メンバー</SelectItem>
                    <SelectItem value="admin">管理者</SelectItem>
                  </SelectContent>
                </Select>
                {field.state.meta.errors.map((error) => (
                  <p key={error?.message} className="text-destructive text-sm">
                    {error?.message}
                  </p>
                ))}
              </div>
            )}
          </form.Field>

          <DialogFooter>
            <DialogClose
              render={<Button type="button" variant="outline" ref={closeRef} />}
            >
              キャンセル
            </DialogClose>
            <form.Subscribe
              selector={(state) =>
                [state.canSubmit, state.isSubmitting] as const
              }
            >
              {([canSubmit, isSubmitting]) => (
                <Button type="submit" disabled={!canSubmit || isSubmitting}>
                  {isSubmitting ? "送信中..." : "招待を送信"}
                </Button>
              )}
            </form.Subscribe>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
