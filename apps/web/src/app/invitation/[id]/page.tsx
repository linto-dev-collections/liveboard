import type { Metadata } from "next";
import { Suspense } from "react";
import { InvitationContainer } from "./_containers/invitation-container";

export const metadata: Metadata = {
  title: "組織への招待",
  description: "招待された組織への参加を確認します。",
  robots: { index: false, follow: false },
};

export default async function InvitationPage({
  params,
}: PageProps<"/invitation/[id]">) {
  const { id } = await params;

  return (
    <Suspense fallback={null}>
      <InvitationContainer id={id} />
    </Suspense>
  );
}
