/**
 * route validator 専用 re-export。
 * 実体は web/server で共有する `@liveboard/shared/schemas/account-deletion.schema` に置く。
 */
export {
  confirmReauthSchema,
  deleteAccountSchema,
  initiateReauthSchema,
} from "@liveboard/shared/schemas";
