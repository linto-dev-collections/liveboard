import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@liveboard/ui/components/ui/card";
import { Building2Icon, PresentationIcon, UsersIcon } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";

export default function DashboardPage() {
  return (
    <>
      <PageHeader items={[{ label: "ダッシュボード" }]} />
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <div>
          <h1 className="font-semibold text-2xl tracking-tight">ようこそ</h1>
          <p className="text-muted-foreground text-sm">
            組織とメンバーを管理できます。
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Link href="/dashboard/boards" className="block">
            <Card className="h-full transition-colors hover:bg-accent/50">
              <CardHeader>
                <PresentationIcon className="size-5 text-muted-foreground" />
                <CardTitle className="mt-2">ボード</CardTitle>
                <CardDescription>
                  ホワイトボードの作成・管理を行います。
                </CardDescription>
              </CardHeader>
            </Card>
          </Link>
          <Link href="/dashboard/settings/organization" className="block">
            <Card className="h-full transition-colors hover:bg-accent/50">
              <CardHeader>
                <Building2Icon className="size-5 text-muted-foreground" />
                <CardTitle className="mt-2">組織</CardTitle>
                <CardDescription>
                  組織名などの設定を変更します。
                </CardDescription>
              </CardHeader>
            </Card>
          </Link>
          <Link href="/dashboard/settings/members" className="block">
            <Card className="h-full transition-colors hover:bg-accent/50">
              <CardHeader>
                <UsersIcon className="size-5 text-muted-foreground" />
                <CardTitle className="mt-2">メンバー</CardTitle>
                <CardDescription>
                  メンバーの招待・管理を行います。
                </CardDescription>
              </CardHeader>
              <CardContent />
            </Card>
          </Link>
        </div>
      </div>
    </>
  );
}
