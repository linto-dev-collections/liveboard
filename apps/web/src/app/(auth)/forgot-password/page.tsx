import { Suspense } from "react";
import { ForgotPasswordContainer } from "./_containers/forgot-password-container";

export default function ForgotPasswordPage() {
  return (
    <Suspense>
      <ForgotPasswordContainer />
    </Suspense>
  );
}
