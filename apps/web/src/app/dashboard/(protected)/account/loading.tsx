import { Separator } from "@liveboard/ui/components/ui/separator";
import { Skeleton } from "@liveboard/ui/components/ui/skeleton";
import { PageHeader } from "@/components/page-header";

// 実コンテンツ: プロフィール / 外観 / ログイン方法 / パスワード / 危険な操作 の 5 セクション
const SECTIONS = [
  { key: "profile", titleW: "w-32", body: "form" },
  { key: "appearance", titleW: "w-16", body: "theme" },
  { key: "sign-in-methods", titleW: "w-32", body: "rows" },
  { key: "password", titleW: "w-24", body: "form" },
  { key: "danger", titleW: "w-24", body: "form" },
] as const;

export default function AccountLoading() {
  return (
    <>
      <PageHeader items={[{ label: "アカウント" }]} />
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <div className="max-w-lg space-y-8">
          {SECTIONS.map((section, idx) => (
            <div key={section.key}>
              {idx > 0 && <Separator className="mb-8" />}
              <div className="space-y-4">
                <Skeleton className={`h-6 ${section.titleW}`} />
                {section.body === "theme" ? (
                  <div className="flex gap-2">
                    <Skeleton className="h-9 w-20" />
                    <Skeleton className="h-9 w-20" />
                    <Skeleton className="h-9 w-20" />
                  </div>
                ) : section.body === "rows" ? (
                  <div className="space-y-3">
                    <Skeleton className="h-14 w-full rounded-md" />
                    <Skeleton className="h-14 w-full rounded-md" />
                  </div>
                ) : (
                  <div className="space-y-3">
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-9 w-24" />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
