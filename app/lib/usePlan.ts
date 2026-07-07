"use client";

import { useClerk, useUser } from "@clerk/nextjs";
import { useEffect, useState } from "react";

export function usePlan() {
  const { user, isLoaded } = useUser();
  const clerk = useClerk();
  const [isPremium, setIsPremium] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!isLoaded || !user) { setIsLoading(false); return; }

    // Admin override via Clerk publicMetadata
    if ((user.publicMetadata as Record<string, unknown>)?.plan === "premium") {
      setIsPremium(true);
      setIsLoading(false);
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (clerk as any).billing
      ?.getSubscription({})
      .then((sub: { subscriptionItems?: Array<{ plan: { isDefault: boolean }; status: string }> } | null) => {
        const premium = sub?.subscriptionItems?.some(
          item => !item.plan.isDefault && item.status === "active"
        ) ?? false;
        setIsPremium(premium);
      })
      .catch(() => setIsPremium(false))
      .finally(() => setIsLoading(false));
  }, [isLoaded, user, clerk]);

  return { isPremium, isLoading };
}
