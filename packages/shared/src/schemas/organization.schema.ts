import { z } from "zod";

export const inviteMemberSchema = z.object({
  email: z.string().email("有効なメールアドレスを入力してください"),
  role: z.enum(["member", "admin"]),
});

export const updateMemberRoleSchema = z.object({
  memberId: z.string().min(1),
  role: z.enum(["member", "admin", "owner"]),
});
