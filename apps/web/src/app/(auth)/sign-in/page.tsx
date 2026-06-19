import { Suspense } from "react";
import { SignInContainer } from "./_containers/sign-in-container";

export default function SignInPage() {
  return (
    <Suspense>
      <SignInContainer />
    </Suspense>
  );
}
