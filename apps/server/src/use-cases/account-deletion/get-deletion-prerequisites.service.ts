import type { OwnedOrganizationSummary } from "../../domain/types/account-deletion";
import type { createOrganizationRepository } from "../../infrastructure/repositories/organization.repository";

type Deps = {
  orgRepo: ReturnType<typeof createOrganizationRepository>;
};

/**
 * 削除前画面が必要とする「owner として所属する org 一覧 + 譲渡候補メンバー」を返す。
 * 通常 owner として所属する org は 1〜数件想定（N+1 問題は無視できる）。
 */
export function createGetDeletionPrerequisitesService(deps: Deps) {
  return {
    async execute(
      userId: string,
    ): Promise<{ ownedOrganizations: OwnedOrganizationSummary[] }> {
      const owned = await deps.orgRepo.findOwnedByUserId(userId);
      const ownedOrganizations = await Promise.all(
        owned.map(async (o) => {
          const candidates = await deps.orgRepo.findOwnerCandidates(
            o.organizationId,
          );
          return {
            organizationId: o.organizationId,
            organizationName: o.organizationName,
            organizationSlug: o.organizationSlug,
            memberCount: o.memberCount,
            candidates,
          };
        }),
      );
      return { ownedOrganizations };
    },
  };
}
