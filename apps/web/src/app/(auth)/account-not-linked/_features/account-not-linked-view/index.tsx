import { Button } from "@liveboard/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@liveboard/ui/components/ui/card";
import { AlertCircleIcon } from "lucide-react";
import Link from "next/link";

/**
 * Better Auth が ACCOUNT_NOT_LINKED を返したときの誘導ページ。
 *
 * 仕様:
 *   - `errorCallbackURL=/account-not-linked` で Google sign-in 失敗時に到達する。
 *   - 本来このページに来るのは「Google が email_verified=false を返した極稀ケース」だが、
 *     その他のリンク失敗 (provider 側の一時障害など) もここで集約する。
 *
 * セキュリティ:
 *   - URL クエリ (`?error=...&email=...` 等) を **一切表示しない**。
 *     user enumeration / 端末肩越し情報漏洩 / open-redirect 風誘導の余地を作らない。
 *   - "既に登録済みのメールアドレスです" とは断定しない汎用文言にする。
 *   - 内部リンクのみ。外部リンクは置かない。
 *
 * `(auth)` Route Group 配下なので未認証で開ける。Server Component。
 */
export function AccountNotLinkedView() {
  return (
    <Card className="mx-auto w-full max-w-md">
      <CardHeader className="items-center text-center">
        <AlertCircleIcon
          className="mx-auto mb-2 size-10 text-warning"
          aria-hidden
        />
        <CardTitle className="text-2xl">
          Google でのログインを完了できませんでした
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-muted-foreground text-sm leading-relaxed">
          このメールアドレスは別のログイン方法で登録されている可能性があります。
          以前ご利用のメールアドレスとパスワードでログインした後、設定画面の
          「ログイン方法」から Google アカウントを連携してください。
        </p>
        <div className="flex flex-col gap-2">
          <Button className="w-full" render={<Link href="/sign-in" />}>
            ログイン画面に戻る
          </Button>
          {/*
            ヘルプ導線は Phase 5 リリース前確認で確定する。
            現状 `(marketing)/help/devtools` のみ存在し、汎用ヘルプ index ページが
            無いため typed routes に乗らない。専用ページが用意できた段階で
            <Button render={<Link href="/help/sign-in-issues" />}>ヘルプを見る</Button>
            を有効化する。
          */}
        </div>
      </CardContent>
    </Card>
  );
}
