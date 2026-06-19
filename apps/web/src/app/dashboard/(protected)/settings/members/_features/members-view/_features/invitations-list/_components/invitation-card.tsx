import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@liveboard/ui/components/ui/alert-dialog";
import { Badge } from "@liveboard/ui/components/ui/badge";
import { Button } from "@liveboard/ui/components/ui/button";
import { XIcon } from "lucide-react";

export function InvitationCard({
  email,
  role,
  onCancel,
}: {
  email: string;
  role: string;
  onCancel: () => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-dashed p-3">
      <div className="flex items-center gap-3">
        <div>
          <p className="font-medium text-sm">{email}</p>
          <Badge variant="outline" className="mt-1">
            {role}
          </Badge>
        </div>
      </div>
      <AlertDialog>
        <AlertDialogTrigger render={<Button variant="ghost" size="icon" />}>
          <XIcon className="size-4" />
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>招待の取り消し</AlertDialogTitle>
            <AlertDialogDescription>
              {email} への招待を取り消してもよろしいですか？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>戻る</AlertDialogCancel>
            <AlertDialogAction onClick={onCancel}>
              招待を取り消す
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
