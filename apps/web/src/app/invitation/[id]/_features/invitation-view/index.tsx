import type { InvitationState } from "../../_lib/types";
import { AcceptInvitation } from "../accept-invitation";
import { InvitationEmailUnverified } from "../invitation-email-unverified";
import { InvitationMismatch } from "../invitation-mismatch";
import { InvitationNotFound } from "../invitation-not-found";

type Props = {
  state: InvitationState;
};

export function InvitationView({ state }: Props) {
  switch (state.kind) {
    case "ok":
      return (
        <AcceptInvitation
          invitationId={state.invitation.id}
          organizationName={state.invitation.organizationName}
          inviterEmail={state.invitation.inviterEmail}
          role={state.invitation.role}
        />
      );
    case "mismatch":
      return <InvitationMismatch />;
    case "email-unverified":
      return <InvitationEmailUnverified />;
    case "not-found":
      return <InvitationNotFound />;
    default: {
      const _exhaustive: never = state;
      throw new Error(`Unknown invitation state: ${String(_exhaustive)}`);
    }
  }
}
