import { Skeleton } from "@liveboard/ui/components/ui/skeleton";
import { PageHeader } from "@/components/page-header";

export default function OrganizationLoading() {
  return (
    <>
      <PageHeader items={[{ label: "設定" }, { label: "組織" }]} />
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <div className="max-w-lg space-y-6">
          <Skeleton className="h-6 w-20" />
          <div className="space-y-3">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-9 w-24" />
          </div>
        </div>
      </div>
    </>
  );
}
