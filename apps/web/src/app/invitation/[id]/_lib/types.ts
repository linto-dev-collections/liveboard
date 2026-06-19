/**
 * Invitation 取得結果の discriminated union。
 *
 * container が `getInvitationState()` を呼んで状態に応じて 1 つに narrow し、
 * `<InvitationView state={...} />` に props として渡す。
 *
 * View 側はこの type を switch で網羅し、各 state に対応する feature を render する。
 */
export type InvitationState =
  | {
      kind: "ok";
      invitation: {
        id: string;
        organizationName: string;
        inviterEmail: string;
        role: string;
      };
    }
  | { kind: "mismatch" }
  | { kind: "email-unverified" }
  | { kind: "not-found" };
