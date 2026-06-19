import { PageHeader } from "@/components/page-header";
import { ConfirmDeleteView } from "../confirm-delete-view";

type Props = {
  nonce: string;
};

/**
 * confirm-delete ページの完成 view (PageHeader + 本体 view を組み立て)。
 * CLAUDE.md §2: page.tsx に直接 PageHeader / コンテンツを並べると
 * Server Component の責務が太るため、ページ全体 view としてここに集約する。
 */
export function ConfirmDeletePageView({ nonce }: Props) {
  return (
    <>
      <PageHeader
        items={[
          { label: "アカウント", href: "/dashboard/account" },
          { label: "削除の最終確認" },
        ]}
      />
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <ConfirmDeleteView nonce={nonce} />
      </div>
    </>
  );
}
