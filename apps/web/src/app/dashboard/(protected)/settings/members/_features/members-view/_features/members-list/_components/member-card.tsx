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
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@liveboard/ui/components/ui/avatar";
import { Badge } from "@liveboard/ui/components/ui/badge";
import { Button } from "@liveboard/ui/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@liveboard/ui/components/ui/select";
import { Trash2Icon } from "lucide-react";
import type { Member } from "../../../../../_lib/types";

export function MemberCard({
  member,
  onRoleChange,
  onRemove,
  isUpdating,
}: {
  member: Member;
  onRoleChange: (role: string) => void;
  onRemove: () => void;
  isUpdating: boolean;
}) {
  const initials = member.user.name
    ? member.user.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
    : member.user.email.charAt(0).toUpperCase();

  return (
    <div className="flex items-center justify-between rounded-lg border p-3">
      <div className="flex items-center gap-3">
        <Avatar className="size-9">
          <AvatarImage
            src={member.user.image ?? undefined}
            alt={member.user.name}
          />
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
        <div>
          <p className="font-medium text-sm">{member.user.name}</p>
          <p className="text-muted-foreground text-xs">{member.user.email}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {member.role === "owner" ? (
          <Badge variant="secondary">オーナー</Badge>
        ) : (
          <Select
            value={member.role}
            onValueChange={(v) => v && onRoleChange(v)}
            disabled={isUpdating}
            items={[
              { value: "admin", label: "管理者" },
              { value: "member", label: "メンバー" },
            ]}
          >
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="admin">管理者</SelectItem>
              <SelectItem value="member">メンバー</SelectItem>
            </SelectContent>
          </Select>
        )}
        {member.role !== "owner" && (
          <AlertDialog>
            <AlertDialogTrigger render={<Button variant="ghost" size="icon" />}>
              <Trash2Icon className="size-4" />
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>メンバーの削除</AlertDialogTitle>
                <AlertDialogDescription>
                  {member.user.name} をこの組織から削除してもよろしいですか？
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>キャンセル</AlertDialogCancel>
                <AlertDialogAction onClick={onRemove}>削除</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
    </div>
  );
}
