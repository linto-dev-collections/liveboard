import { Skeleton } from "@liveboard/ui/components/ui/skeleton";

const PLACEHOLDER_KEYS = ["a", "b", "c", "d", "e", "f", "g", "h"];

export default function BoardsLoading() {
  return (
    <div className="flex flex-1 flex-col gap-6 p-4 pt-0">
      <div className="flex items-center justify-between gap-2">
        <Skeleton className="h-9 w-full max-w-xs" />
        <Skeleton className="h-9 w-28" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {PLACEHOLDER_KEYS.map((key) => (
          <Skeleton key={key} className="aspect-[4/3] w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}
