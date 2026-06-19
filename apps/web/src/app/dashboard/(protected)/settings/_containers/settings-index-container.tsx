import { redirect } from "next/navigation";

/**
 * /dashboard/settings/ 直アクセス用 redirect container。
 *
 * settings 配下に landing は持たず、organization タブを既定として表示する。
 * `redirect()` は `never` を返して以後の render を短絡するため UI は描画されない。
 * 型上 JSX として埋め込むためには return 文を残す必要があるため、
 * 到達不能な `return null` を置いている。
 */
export function SettingsIndexContainer(): null {
  redirect("/dashboard/settings/organization");
}
