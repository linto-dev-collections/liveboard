import { Skeleton } from "@liveboard/ui/components/ui/skeleton";
import { PageHeader } from "@/components/page-header";

const MEMBER_KEYS = ["m1", "m2", "m3", "m4"] as const;

export default function MembersLoading() {
  return (
    <>
      <PageHeader items={[{ label: "設定" }, { label: "メンバー" }]} />
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <div className="space-y-6">
          {/* ヘッダ + 招待ボタン */}
          <div className="flex items-center justify-between">
            <Skeleton className="h-6 w-24" />
            <Skeleton className="h-9 w-28" />
          </div>

          {/* メンバー一覧 */}
          <div className="rounded-lg border bg-card">
            {MEMBER_KEYS.map((k, i) => (
              <div
                key={k}
                className={`flex items-center gap-3 p-4 ${i > 0 ? "border-t" : ""}`}
              >
                <Skeleton className="size-9 shrink-0 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-48" />
                </div>
                <Skeleton className="h-5 w-16 rounded-full" />
                <Skeleton className="size-8 shrink-0" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
