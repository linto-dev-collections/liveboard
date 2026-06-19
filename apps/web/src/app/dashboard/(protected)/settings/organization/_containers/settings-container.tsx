import { SettingsView } from "../_features/settings-view";
import { getActiveOrganization } from "../_lib/queries";

export async function SettingsContainer() {
  const result = await getActiveOrganization();

  if (!result.success) {
    return <p className="text-muted-foreground text-sm">{result.error}</p>;
  }

  return <SettingsView organization={result.data} />;
}
