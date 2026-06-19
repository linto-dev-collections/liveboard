import { Suspense } from "react";
import { ResetPasswordContainer } from "./_containers/reset-password-container";

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordContainer />
    </Suspense>
  );
}
