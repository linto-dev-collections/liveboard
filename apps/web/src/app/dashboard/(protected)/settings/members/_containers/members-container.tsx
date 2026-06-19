import { MembersView } from "../_features/members-view";
import { getFullOrganization } from "../_lib/queries";

export async function MembersContainer() {
  const result = await getFullOrganization();

  if (!result.success) {
    return <p className="text-muted-foreground text-sm">{result.error}</p>;
  }

  return (
    <MembersView
      members={result.data.members}
      invitations={result.data.invitations}
    />
  );
}
