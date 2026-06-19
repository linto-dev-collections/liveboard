import { PageHeader } from "@/components/page-header";
import { SettingsContainer } from "./_containers/settings-container";

export default function SettingsPage() {
  return (
    <>
      <PageHeader items={[{ label: "設定" }, { label: "組織" }]} />
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <SettingsContainer />
      </div>
    </>
  );
}
