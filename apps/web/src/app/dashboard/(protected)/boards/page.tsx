import { PageHeader } from "@/components/page-header";
import { BoardsContainer } from "./_containers/boards-container";
import { loadBoardsSearchParams } from "./_lib/search-params";

export default async function BoardsPage({
  searchParams,
}: PageProps<"/dashboard/boards">) {
  const { q, favorite, sort } = await loadBoardsSearchParams(searchParams);
  return (
    <>
      <PageHeader items={[{ label: "ボード" }]} />
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <BoardsContainer q={q} favorite={favorite} sort={sort} />
      </div>
    </>
  );
}
