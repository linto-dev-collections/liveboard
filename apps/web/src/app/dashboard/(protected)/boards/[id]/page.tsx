import { PageHeader } from "@/components/page-header";
import { BoardCanvasContainer } from "./_containers/board-canvas-container";

export default async function BoardDetailPage({
  params,
}: PageProps<"/dashboard/boards/[id]">) {
  const { id } = await params;
  return (
    <>
      <PageHeader
        items={[
          { label: "ボード", href: "/dashboard/boards" },
          { label: "キャンバス" },
        ]}
      />
      <BoardCanvasContainer boardId={id} />
    </>
  );
}
