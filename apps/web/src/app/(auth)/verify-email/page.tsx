import { Suspense } from "react";
import { VerifyEmailContainer } from "./_containers/verify-email-container";

export default async function VerifyEmailPage({
  searchParams,
}: PageProps<"/verify-email">) {
  const params = await searchParams;
  const rawToken = params.token;
  const token = Array.isArray(rawToken) ? rawToken[0] : rawToken;
  const normalizedToken = token ? token : undefined;

  return (
    // Suspense は client component (Container) の useSearchParams を吸収する役目
    // が無くなったので fallback は null で十分。container 自身が "verifying" 状態を
    // 即座に描画する。
    <Suspense fallback={null}>
      <VerifyEmailContainer token={normalizedToken} />
    </Suspense>
  );
}
