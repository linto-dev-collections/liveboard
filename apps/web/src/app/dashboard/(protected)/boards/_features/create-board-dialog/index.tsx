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
import { PlusIcon } from "lucide-react";
import { useRef } from "react";
import { useCreateBoardForm } from "./use-form";

export function CreateBoardDialog() {
  const closeRef = useRef<HTMLButtonElement>(null);
  const form = useCreateBoardForm(() => {
    closeRef.current?.click();
  });

  return (
    <Dialog>
      <DialogTrigger render={<Button size="sm" />}>
        <PlusIcon className="mr-2 size-4" />
        ボードを作成
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>ボードを作成</DialogTitle>
          <DialogDescription>
            新しいホワイトボードを作成します。タイトルは後から変更できます。
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
          <form.Field name="title">
            {(field) => (
              <div className="space-y-2">
                <Label htmlFor={field.name}>タイトル</Label>
                <Input
                  id={field.name}
                  name={field.name}
                  placeholder="Untitled"
                  autoFocus
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
                  {isSubmitting ? "作成中..." : "作成"}
                </Button>
              )}
            </form.Subscribe>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
