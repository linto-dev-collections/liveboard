"use client";

import { Button } from "@liveboard/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@liveboard/ui/components/ui/card";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { acceptInvitation, rejectInvitation } from "../../_lib/actions";

type Props = {
  invitationId: string;
  organizationName: string;
  inviterEmail: string;
  /** owner / admin / member など、招待時に指定されたロール。 */
  role: string;
};

const ROLE_LABEL: Record<string, string> = {
  owner: "オーナー",
  admin: "管理者",
  member: "メンバー",
};

export function AcceptInvitation({
  invitationId,
  organizationName,
  inviterEmail,
  role,
}: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleAccept = async () => {
    setLoading(true);
    const result = await acceptInvitation(invitationId);
    setLoading(false);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success("招待を承認しました");
    router.push("/dashboard");
  };

  const handleReject = async () => {
    setLoading(true);
    const result = await rejectInvitation(invitationId);
    setLoading(false);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success("招待を辞退しました");
    router.push("/dashboard");
  };

  const roleLabel = ROLE_LABEL[role] ?? role;

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>組織への招待</CardTitle>
          <CardDescription>
            <span className="font-medium text-foreground">{inviterEmail}</span>{" "}
            さんから、組織「
            <span className="font-medium text-foreground">
              {organizationName}
            </span>
            」に{" "}
            <span className="font-medium text-foreground">{roleLabel}</span>{" "}
            として招待されています。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            承認すると、この組織のリソースにアクセスできるようになります。
          </p>
        </CardContent>
        <CardFooter className="flex gap-3">
          <Button
            variant="outline"
            onClick={handleReject}
            disabled={loading}
            className="flex-1"
          >
            辞退
          </Button>
          <Button onClick={handleAccept} disabled={loading} className="flex-1">
            {loading ? "処理中..." : "承認"}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
