import {
  SidebarInset,
  SidebarProvider,
} from "@liveboard/ui/components/ui/sidebar";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AppSidebar } from "@/components/app-sidebar";
import { AuthProvider } from "@/components/auth-provider";

export const dynamic = "force-dynamic";

// session cookie で守られているが、何らかの経路で URL が露出した際にも
// SERP に出ないようダッシュボード配下を一律 noindex にする。
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const session = cookieStore.get("__Secure-liveboard.session_token");
  if (!session) {
    redirect("/sign-in");
  }

  return (
    <AuthProvider>
      <SidebarProvider>
        <AppSidebar />
        {/* SidebarInset は sidebar-wrapper の横並び flex item。デフォルトの
            min-width: auto は子の intrinsic min-content に解決されるため、
            横長テーブル等を含むページでは viewport を超えてページ全体に
            横スクロールが発生する。
            - min-w-0: flex item を viewport 内に収まるよう shrink 可能にする
            - overflow-x-clip: 子要素の visual overflow を SidebarInset の box で
              確実にクリップ (popover/dialog は portal されるため影響なし)。
              これにより横スクロールが必要な内部要素は自分自身で
              overflow-x-auto を持つ必要がある。 */}
        <SidebarInset className="min-w-0 overflow-x-clip">
          {children}
        </SidebarInset>
      </SidebarProvider>
    </AuthProvider>
  );
}
