import { PresentationIcon } from "lucide-react";

/**
 * ボードが 1 つも無いときのオンボーディング空状態（presentational）。
 * 作成導線はツールバーの「ボードを作成」を案内する。
 */
export function BoardsEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-16 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-muted">
        <PresentationIcon className="size-6 text-muted-foreground" />
      </div>
      <div className="space-y-1">
        <p className="font-medium">まだボードがありません</p>
        <p className="text-muted-foreground text-sm">
          右上の「ボードを作成」から最初のボードを作りましょう。
        </p>
      </div>
    </div>
  );
}
