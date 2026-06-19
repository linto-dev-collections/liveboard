import { createAccessControl } from "better-auth/plugins/access";
import {
  adminAc,
  defaultStatements,
  memberAc,
  ownerAc,
} from "better-auth/plugins/organization/access";

const statement = {
  ...defaultStatements,
  dashboard: ["read"],
  board: ["read", "create", "update", "delete"],
  members: ["read", "invite", "remove"],
  settings: ["read", "update"],
} as const;

export const ac = createAccessControl(statement);

export const member = ac.newRole({
  dashboard: ["read"],
  board: ["read", "create"],
  members: ["read"],
  settings: ["read"],
  ...memberAc.statements,
});

export const admin = ac.newRole({
  dashboard: ["read"],
  board: ["read", "create", "update", "delete"],
  members: ["read", "invite", "remove"],
  settings: ["read", "update"],
  ...adminAc.statements,
});

export const owner = ac.newRole({
  dashboard: ["read"],
  board: ["read", "create", "update", "delete"],
  members: ["read", "invite", "remove"],
  settings: ["read", "update"],
  ...ownerAc.statements,
});
