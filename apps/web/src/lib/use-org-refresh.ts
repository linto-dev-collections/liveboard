"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { useAuth } from "@/components/auth-provider";

/**
 * activeOrganizationId の変更を検知し、router.refresh() を呼ぶ。
 */
export function useOrgRefresh() {
  const router = useRouter();
  const { activeOrg } = useAuth();
  const prevOrgId = useRef(activeOrg?.id);

  useEffect(() => {
    if (prevOrgId.current !== activeOrg?.id) {
      prevOrgId.current = activeOrg?.id;
      router.refresh();
    }
  }, [activeOrg?.id, router]);
}
