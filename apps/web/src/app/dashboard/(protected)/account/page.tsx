import { PageHeader } from "@/components/page-header";
import { AccountContainer } from "./_containers/account-container";

export default async function AccountPage({
  searchParams,
}: PageProps<"/dashboard/account">) {
  const sp = await searchParams;
  const linked = typeof sp.linked === "string" ? sp.linked : undefined;
  return (
    <>
      <PageHeader items={[{ label: "アカウント" }]} />
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <AccountContainer linkedStatus={linked} />
      </div>
    </>
  );
}
