import { Suspense } from "react";
import { CheckEmailContainer } from "./_containers/check-email-container";

export default async function CheckEmailPage({
  searchParams,
}: PageProps<"/check-email">) {
  const sp = await searchParams;
  const email = typeof sp.email === "string" ? sp.email : undefined;
  return (
    <Suspense>
      <CheckEmailContainer email={email} />
    </Suspense>
  );
}
