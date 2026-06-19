import { Alert, AlertDescription } from "@liveboard/ui/components/ui/alert";
import { Button } from "@liveboard/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@liveboard/ui/components/ui/card";
import { MailIcon } from "lucide-react";
import Link from "next/link";

/**
 * 招待を受諾できる権限はある (= 招待先メール == セッションのメール) が、
 * そのメールアドレスがまだ verified=true になっていないときに表示する。
 *
 * Better Auth 1.6.9 の crud-invites では、`requireEmailVerificationOnInvitation: true`
 * を組織プラグインに渡している限り、未検証アカウントは getInvitation / acceptInvitation
 * の両方で 403 (EMAIL_VERIFICATION_REQUIRED_FOR_INVITATION /
 *      EMAIL_VERIFICATION_REQUIRED_BEFORE_ACCEPTING_OR_REJECTING_INVITATION) を返す。
 * ここは pre-fetch の段階でその 403 を捕まえた UI。
 */
export function InvitationEmailUnverified() {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="items-center justify-items-center text-center">
          <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-full bg-primary/10">
            <MailIcon className="size-6 text-primary" />
          </div>
          <CardTitle>メールアドレスの確認が必要です</CardTitle>
          <CardDescription>
            招待を承認する前に、メールアドレスの確認を完了してください。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert>
            <MailIcon className="size-4" />
            <AlertDescription>
              ご登録時にお送りした確認メール内のリンクをクリックしてください。
              メールが見つからない場合は、再送ページからもう一度送信できます。
            </AlertDescription>
          </Alert>
        </CardContent>
        <CardFooter>
          <Button
            className="w-full"
            nativeButton={false}
            render={<Link href="/check-email" />}
          >
            確認メールの再送について
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
