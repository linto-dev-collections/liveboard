"use client";

import { DeleteAccountDialog } from "./_features/delete-account-dialog";

type Props = { userName: string };

/**
 * アカウント設定画面の Danger Zone セクション。
 * 削除前にユーザーに削除内容を明示し、ボタン押下で 2 ステップ Dialog を開く。
 */
export function DeleteAccountSection({ userName }: Props) {
  return (
    <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4">
      <h3 className="font-medium">アカウントを削除する</h3>
      <p className="mt-1 text-muted-foreground text-sm">
        アカウントを削除すると、以下のデータがすべて復旧不可能で削除されます。
      </p>
      <ul className="mt-2 list-disc pl-5 text-muted-foreground text-sm">
        <li>すべての録画とサムネイル</li>
        <li>フォルダ、コメント、共有リンク</li>
        <li>サブスクリプション（Pro は課金が即停止します）</li>
        <li>Google Drive 連携・Webhook・トランスクリプション</li>
      </ul>
      <div className="mt-4">
        <DeleteAccountDialog userName={userName} />
      </div>
    </div>
  );
}
