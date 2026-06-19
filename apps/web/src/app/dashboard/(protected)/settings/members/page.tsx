import { PageHeader } from "@/components/page-header";
import { MembersContainer } from "./_containers/members-container";

export default function MembersPage() {
  return (
    <>
      <PageHeader items={[{ label: "設定" }, { label: "メンバー" }]} />
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <MembersContainer />
      </div>
    </>
  );
}
