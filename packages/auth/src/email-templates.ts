/**
 * HTML email templates for authentication flows.
 *
 * All user-supplied values are escaped via {@link escapeHtml} to prevent
 * XSS / HTML-injection in email clients.
 */

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function verificationEmailHtml(userName: string, url: string): string {
  const safeName = escapeHtml(userName);
  const safeUrl = escapeHtml(url);

  return `
<!DOCTYPE html>
<html lang="ja">
<head><meta charset="utf-8" /></head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:480px;margin:40px auto;background-color:#ffffff;border-radius:8px;overflow:hidden;">
    <div style="padding:32px 24px;">
      <h2 style="margin:0 0 24px;font-size:20px;color:#18181b;">メールアドレスの確認</h2>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#3f3f46;">${safeName} 様</p>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#3f3f46;">liveboard へのご登録ありがとうございます。</p>
      <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#3f3f46;">以下のボタンをクリックして、メールアドレスの確認を完了してください。</p>
      <p style="text-align:center;margin:32px 0;">
        <a href="${safeUrl}" style="display:inline-block;padding:12px 32px;background-color:#18181b;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;font-size:15px;">
          メールアドレスを確認する
        </a>
      </p>
      <p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:#a1a1aa;">
        このリンクは24時間有効です。<br/>
        心当たりがない場合は、このメールを無視してください。
      </p>
    </div>
  </div>
</body>
</html>`.trim();
}

export function existingUserSignUpEmailHtml(
  userName: string,
  loginUrl: string,
): string {
  const safeName = escapeHtml(userName);
  const safeUrl = escapeHtml(loginUrl);

  return `
<!DOCTYPE html>
<html lang="ja">
<head><meta charset="utf-8" /></head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:480px;margin:40px auto;background-color:#ffffff;border-radius:8px;overflow:hidden;">
    <div style="padding:32px 24px;">
      <h2 style="margin:0 0 24px;font-size:20px;color:#18181b;">アカウント登録について</h2>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#3f3f46;">${safeName} 様</p>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#3f3f46;">このメールアドレスで新規登録が試みられましたが、すでにアカウントが登録されています。</p>
      <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#3f3f46;">以下のボタンからログインしてください。</p>
      <p style="text-align:center;margin:32px 0;">
        <a href="${safeUrl}" style="display:inline-block;padding:12px 32px;background-color:#18181b;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;font-size:15px;">
          ログインする
        </a>
      </p>
      <p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:#a1a1aa;">
        パスワードをお忘れの場合は、ログインページの「パスワードを忘れた方」からリセットできます。<br/>
        心当たりがない場合は、このメールを無視してください。
      </p>
    </div>
  </div>
</body>
</html>`.trim();
}

/**
 * Google でしか登録していないユーザー (credential 無し) 向けの「重複サインアップ通知」メール。
 *
 * 通常版との違い:
 *   - 「password を入れて入ろうとして詰む」のを避けるため、明示的に
 *     「Google で登録されている」事実を伝える
 *   - 「パスワードを忘れた方」案内は出さない (そもそも持っていないため文脈に合わない)
 *   - CTA は /sign-in?email=...&provider=google で、ページ側で email pre-fill +
 *     Google ボタンの強調表示が行われる
 *
 * セキュリティ: 本メールは登録済 email 本人にしか届かないため、provider 情報を
 * 本文に書いても enumeration リスクは無い (sign-up API の generic レスポンスは
 * 維持しているため、攻撃者は外部から provider を区別できない)。
 */
export function existingUserSignUpEmailGoogleHtml(
  userName: string,
  signInUrl: string,
): string {
  const safeName = escapeHtml(userName);
  const safeUrl = escapeHtml(signInUrl);

  return `
<!DOCTYPE html>
<html lang="ja">
<head><meta charset="utf-8" /></head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:480px;margin:40px auto;background-color:#ffffff;border-radius:8px;overflow:hidden;">
    <div style="padding:32px 24px;">
      <h2 style="margin:0 0 24px;font-size:20px;color:#18181b;">アカウント登録について</h2>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#3f3f46;">${safeName} 様</p>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#3f3f46;">このメールアドレスで新規登録が試みられましたが、Google アカウントですでに登録されています。</p>
      <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#3f3f46;">下のボタンからログイン画面を開き、「Google で続行」を選択してください。</p>
      <p style="text-align:center;margin:32px 0;">
        <a href="${safeUrl}" style="display:inline-block;padding:12px 32px;background-color:#18181b;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;font-size:15px;">
          ログイン画面を開く
        </a>
      </p>
      <p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:#a1a1aa;">
        心当たりがない場合は、このメールを無視してください。<br/>
        パスワードでもログインしたい場合は、ログイン画面の「パスワードを忘れた方はこちら」からパスワードを設定できます。
      </p>
    </div>
  </div>
</body>
</html>`.trim();
}

export function ownershipTransferNoticeEmailHtml(params: {
  recipientName: string;
  organizationName: string;
  previousOwnerName: string;
}): string {
  const safeRecipient = escapeHtml(params.recipientName);
  const safeOrg = escapeHtml(params.organizationName);
  const safePrev = escapeHtml(params.previousOwnerName);

  return `
<!DOCTYPE html>
<html lang="ja">
<head><meta charset="utf-8" /></head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:480px;margin:40px auto;background-color:#ffffff;border-radius:8px;overflow:hidden;">
    <div style="padding:32px 24px;">
      <h2 style="margin:0 0 24px;font-size:20px;color:#18181b;">組織オーナーの引継ぎ</h2>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#3f3f46;">${safeRecipient} 様</p>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#3f3f46;">${safePrev} さんがアカウントを削除されたため、組織「<strong>${safeOrg}</strong>」のオーナーが ${safeRecipient} さんに引き継がれました。</p>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#3f3f46;">これにより、組織の設定変更・メンバー管理・課金管理などの権限が付与されています。</p>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#3f3f46;">もしオーナー権限を別のメンバーに渡したい場合は、ダッシュボードのメンバー画面から変更できます。</p>
    </div>
  </div>
</body>
</html>`.trim();
}

function roleLabelJa(role: string): string {
  if (role === "admin") return "管理者";
  if (role === "member") return "メンバー";
  if (role === "owner") return "オーナー";
  return role;
}

export function invitationEmailSubject(params: {
  inviterName: string;
  organizationName: string;
}): string {
  return `${params.inviterName} さんから「${params.organizationName}」への招待が届いています - liveboard`;
}

export function invitationEmailHtml(params: {
  inviterName: string;
  inviterEmail: string;
  organizationName: string;
  role: string;
  inviteUrl: string;
}): string {
  const safeInviter = escapeHtml(params.inviterName);
  const safeInviterEmail = escapeHtml(params.inviterEmail);
  const safeOrg = escapeHtml(params.organizationName);
  const safeRole = escapeHtml(roleLabelJa(params.role));
  const safeUrl = escapeHtml(params.inviteUrl);

  return `
<!DOCTYPE html>
<html lang="ja">
<head><meta charset="utf-8" /></head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:480px;margin:40px auto;background-color:#ffffff;border-radius:8px;overflow:hidden;">
    <div style="padding:32px 24px;">
      <h2 style="margin:0 0 24px;font-size:20px;color:#18181b;">組織への招待</h2>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#3f3f46;">${safeInviter} さん (${safeInviterEmail}) から、組織「<strong>${safeOrg}</strong>」への招待が届きました。</p>
      <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#3f3f46;">招待されているロール: <strong>${safeRole}</strong></p>
      <p style="text-align:center;margin:32px 0;">
        <a href="${safeUrl}" style="display:inline-block;padding:12px 32px;background-color:#18181b;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;font-size:15px;">
          招待を承認する
        </a>
      </p>
      <p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:#a1a1aa;">
        承認すると、liveboard にログインして組織「${safeOrg}」のメンバーとして参加できます。<br/>
        心当たりがない場合は、このメールを無視してください。
      </p>
    </div>
  </div>
</body>
</html>`.trim();
}

export function resetPasswordEmailHtml(userName: string, url: string): string {
  const safeName = escapeHtml(userName);
  const safeUrl = escapeHtml(url);

  return `
<!DOCTYPE html>
<html lang="ja">
<head><meta charset="utf-8" /></head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:480px;margin:40px auto;background-color:#ffffff;border-radius:8px;overflow:hidden;">
    <div style="padding:32px 24px;">
      <h2 style="margin:0 0 24px;font-size:20px;color:#18181b;">パスワードのリセット</h2>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#3f3f46;">${safeName} 様</p>
      <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#3f3f46;">パスワードリセットのリクエストを受け付けました。以下のボタンをクリックして、新しいパスワードを設定してください。</p>
      <p style="text-align:center;margin:32px 0;">
        <a href="${safeUrl}" style="display:inline-block;padding:12px 32px;background-color:#18181b;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;font-size:15px;">
          パスワードをリセットする
        </a>
      </p>
      <p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:#a1a1aa;">
        このリンクは1時間有効です。<br/>
        心当たりがない場合は、このメールを無視してください。パスワードは変更されません。
      </p>
    </div>
  </div>
</body>
</html>`.trim();
}
