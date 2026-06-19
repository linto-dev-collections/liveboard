import { Suspense } from "react";
import { SignUpContainer } from "./_containers/sign-up-container";

export default function SignUpPage() {
  return (
    <Suspense>
      <SignUpContainer />
    </Suspense>
  );
}
