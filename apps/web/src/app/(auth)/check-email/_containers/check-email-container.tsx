import { CheckEmailView } from "../_features/check-email-view";

type Props = {
  email?: string;
};

/**
 * check-email ページ用 Server Container。
 * page.tsx 側で URL から email を抽出して props で受け取る。
 */
export function CheckEmailContainer({ email }: Props) {
  return <CheckEmailView email={email} />;
}
