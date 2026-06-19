"use client";

import { createContext, useCallback, useContext } from "react";
import { authClient } from "@/lib/auth-client";

type Session = (typeof authClient)["$Infer"]["Session"] | null;
type Organization = {
  id: string;
  name: string;
  slug: string;
} | null;
type OrganizationList = { id: string; name: string; slug: string }[];

type AuthContextType = {
  session: Session;
  isPending: boolean;
  activeOrg: Organization;
  orgsPending: boolean;
  orgs: OrganizationList;
  refetchOrg: () => Promise<void>;
  /**
   * better-auth client の useSession() 内部 store を refetch する。
   * `authClient.getSession({ disableCookieCache: true })` だけでは
   * useSession() の reactive store までは更新されないため、
   * user.image など session フィールドを変更した直後にこれを呼ぶ。
   */
  refetchSession: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  session: null,
  isPending: true,
  activeOrg: null,
  orgsPending: true,
  orgs: [],
  refetchOrg: async () => {},
  refetchSession: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const {
    data: session,
    isPending: sessionPending,
    refetch: refetchSessionRaw,
  } = authClient.useSession();
  const {
    data: activeOrg,
    isPending: activeOrgPending,
    refetch: refetchActiveOrg,
  } = authClient.useActiveOrganization();
  const {
    data: orgs,
    isPending: orgListPending,
    refetch: refetchOrgs,
  } = authClient.useListOrganizations();

  const refetchOrg = useCallback(async () => {
    await Promise.all([refetchActiveOrg(), refetchOrgs()]);
  }, [refetchActiveOrg, refetchOrgs]);

  const refetchSession = useCallback(async () => {
    await refetchSessionRaw();
  }, [refetchSessionRaw]);

  const value: AuthContextType = {
    session: session ?? null,
    isPending: sessionPending,
    activeOrg: (activeOrg as Organization) ?? null,
    orgsPending: activeOrgPending || orgListPending,
    orgs: (orgs as OrganizationList) ?? [],
    refetchOrg,
    refetchSession,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
