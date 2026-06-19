import { db } from "@liveboard/db";
import * as authSchema from "@liveboard/db/schema/auth";
import { env } from "@liveboard/env/server";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { lastLoginMethod, organization } from "better-auth/plugins";
import { Resend } from "resend";
import { isAccountDeletionInProgressForEmail } from "./account-deletion-guard";
import { userHasCredentialAccount } from "./credential-account-presence";
import {
  existingUserSignUpEmailGoogleHtml,
  existingUserSignUpEmailHtml,
  invitationEmailHtml,
  invitationEmailSubject,
  ownershipTransferNoticeEmailHtml,
  resetPasswordEmailHtml,
  verificationEmailHtml,
} from "./email-templates";
import {
  bootstrapPersonalOrganization,
  getOldestOrganizationIdForUser,
} from "./organization-bootstrap";
import { ac, admin, member, owner } from "./permissions";

const schema = { ...authSchema };

/**
 * PBKDF2 password hashing using Web Crypto API.
 * crypto.subtle operations do NOT count against CF Workers CPU time limit,
 * making this compatible with the Free plan (10ms CPU).
 */
async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const hash = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
      key,
      256,
    ),
  );
  const saltB64 = btoa(String.fromCharCode(...salt));
  const hashB64 = btoa(String.fromCharCode(...hash));
  return `pbkdf2:100000:${saltB64}:${hashB64}`;
}

/**
 * 後継 owner への引継ぎ通知メール。
 * best-effort 設計のため、呼び出し側で try/catch して失敗を warn ログにする。
 */
export async function sendOwnershipTransferNoticeEmail(params: {
  resendApiKey: string;
  fromEmail: string;
  to: string;
  recipientName: string;
  organizationName: string;
  previousOwnerName: string;
}): Promise<void> {
  const resend = new Resend(params.resendApiKey);
  const { error } = await resend.emails.send({
    from: params.fromEmail,
    to: [params.to],
    subject: `組織「${params.organizationName}」のオーナーになりました - liveboard`,
    html: ownershipTransferNoticeEmailHtml({
      recipientName: params.recipientName,
      organizationName: params.organizationName,
      previousOwnerName: params.previousOwnerName,
    }),
  });
  if (error) {
    throw new Error(
      `Failed to send ownership transfer notice: ${JSON.stringify(error)}`,
    );
  }
}

export async function verifyPassword({
  hash,
  password,
}: {
  hash: string;
  password: string;
}): Promise<boolean> {
  const [prefix, iterStr, saltB64, hashB64] = hash.split(":");
  if (prefix === "pbkdf2" && iterStr && saltB64 && hashB64) {
    const iterations = Number(iterStr);
    const salt = Uint8Array.from(atob(saltB64), (c) => c.charCodeAt(0));
    const storedHash = atob(hashB64);
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(password),
      "PBKDF2",
      false,
      ["deriveBits"],
    );
    const derived = new Uint8Array(
      await crypto.subtle.deriveBits(
        { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
        key,
        256,
      ),
    );
    const derivedStr = String.fromCharCode(...derived);
    if (storedHash.length !== derivedStr.length) return false;
    let result = 0;
    for (let i = 0; i < storedHash.length; i++) {
      result |= storedHash.charCodeAt(i) ^ derivedStr.charCodeAt(i);
    }
    return result === 0;
  }
  // Fallback: unsupported hash format
  return false;
}

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "sqlite",
    schema: schema,
  }),
  trustedOrigins: [...env.CORS_ORIGIN.split(",").map((o: string) => o.trim())],
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, token }) => {
      const frontendOrigin =
        env.CORS_ORIGIN.split(",")[0]?.trim() ?? env.BETTER_AUTH_URL;
      const verifyUrl = `${frontendOrigin}/verify-email?token=${encodeURIComponent(token)}`;
      const resend = new Resend(env.RESEND_API_KEY);
      const { error } = await resend.emails.send({
        from: env.FROM_EMAIL,
        to: [user.email],
        subject: "メールアドレスの確認 - liveboard",
        html: verificationEmailHtml(user.name, verifyUrl),
      });
      if (error) {
        console.error("[sendVerificationEmail] Resend API error:", error);
      }
    },
  },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    async onExistingUserSignUp({ user }) {
      console.log(
        "[onExistingUserSignUp] called for user:",
        user.email,
        "id:",
        user.id,
      );
      const frontendOrigin =
        env.CORS_ORIGIN.split(",")[0]?.trim() ?? env.BETTER_AUTH_URL;
      const loginUrl = `${frontendOrigin}/sign-in`;

      // credential account の有無でメール本文を切替:
      //   - 持っている (= 通常 or 両方): 既存テンプレ
      //   - 持っていない (= OAuth 専用): Google で登録済の事実を伝えるテンプレ
      // CTA URL は両方とも `/sign-in` に固定 (ページ側 UI に分岐情報は持ち込まない)。
      // 本文に provider を書いても enumeration には繋がらない (メールは
      // 登録済 email 本人にしか届かない、sign-up API のレスポンスは generic 維持)。
      const hasCredential = await userHasCredentialAccount(user.id);
      const subject = hasCredential
        ? "アカウント登録について - liveboard"
        : "Google アカウントですでに登録されています - liveboard";
      const html = hasCredential
        ? existingUserSignUpEmailHtml(user.name, loginUrl)
        : existingUserSignUpEmailGoogleHtml(user.name, loginUrl);

      console.log("[onExistingUserSignUp] hasCredential:", hasCredential);
      const resend = new Resend(env.RESEND_API_KEY);
      const { data, error } = await resend.emails.send({
        from: env.FROM_EMAIL,
        to: [user.email],
        subject,
        html,
      });
      if (error) {
        console.error("[onExistingUserSignUp] Resend API error:", error);
      } else {
        console.log(
          "[onExistingUserSignUp] Email sent successfully, id:",
          data,
        );
      }
    },
    resetPasswordTokenExpiresIn: 3600,
    sendResetPassword: async ({ user, token }) => {
      const frontendOrigin =
        env.CORS_ORIGIN.split(",")[0]?.trim() ?? env.BETTER_AUTH_URL;
      const resetUrl = `${frontendOrigin}/reset-password?token=${encodeURIComponent(token)}`;
      const resend = new Resend(env.RESEND_API_KEY);
      const { error } = await resend.emails.send({
        from: env.FROM_EMAIL,
        to: [user.email],
        subject: "パスワードのリセット - liveboard",
        html: resetPasswordEmailHtml(user.name, resetUrl),
      });
      if (error) {
        console.error("[sendResetPassword] Resend API error:", error);
      }
    },
    password: {
      hash: hashPassword,
      verify: verifyPassword,
    },
  },
  socialProviders: {
    google: {
      clientId: env.GOOGLE_SIGNIN_CLIENT_ID,
      clientSecret: env.GOOGLE_SIGNIN_CLIENT_SECRET,
      // scope は openid email profile のみ (profile fetch 用、最小権限)。
      // - access_type=offline は意図的に指定しない: refresh token を `account` テーブルに
      //   at-rest 保存しないことで漏洩時の blast radius を最小化する。
      //   profile fetch 後に Google access token は使われないため offline は不要。
      // - prompt=select_account: 複数 Google アカウント保持ユーザーが
      //   意図しないアカウントで紐付くのを防ぐ。consent は付けない (毎回同意画面が
      //   出ると初見ユーザーの UX を損ねる)。
      prompt: "select_account",
      mapProfileToUser: (profile) => ({
        // user.name は NOT NULL。Google が name を返さない極稀ケース
        // (Workspace プロビジョニング系) では email の local-part を fallback。
        name: profile.name?.trim() || profile.email?.split("@")[0] || "User",
        image: profile.picture ?? undefined,
      }),
    },
  },
  // accountLinking.enabled=true (default) のまま `trustedProviders` を空にすることで
  // 「provider が email_verified=true を返した時のみ既存ユーザーに自動 link」する。
  // Google は通常 email_verified=true を返すためユーザー視点ではシームレスだが、
  // 万一 verified=false で返るケース (外部 IdP federated Workspace 等) では
  // ACCOUNT_NOT_LINKED エラーになり、`/account-not-linked` 誘導ページに飛ばす (Phase 3)。
  // trustedProviders に google を入れると non-verified ケースでも link されてしまい
  // account takeover の余地が生まれるため、意図的に入れない。
  account: {
    accountLinking: {
      enabled: true,
    },
  },
  // databaseHooks:
  //   - user.create.before: 削除フロー進行中ユーザーの再登録阻止 (Phase 1)。
  //     email/password・Google・linkSocial の全経路で新規 user 行作成時に呼ばれるので
  //     一箇所で網羅できる (apps/server/src/routes/auth.route.ts の Hono レベル guard より
  //     守備範囲が広い)。
  //   - user.create.after: 個人 organization + owner member の自動作成 (Phase 2)。
  //     verify-email ページ CSR にあった race を根絶し、email/password と Google で
  //     ロジックを共有する。失敗は warn-only (sign-up 自体を fail させない)。
  //     セーフネットとして session.create.before で再度引き当てを試みる。
  //   - session.create.before: activeOrganizationId の自動 fill (Phase 2)。
  //     新規サインアップ直後の session でも、加入順最古の organization が必ず詰まる。
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          if (await isAccountDeletionInProgressForEmail(user.email)) {
            // enumeration 防止のため「削除中である」とは伝えない汎用文言。
            // apps/server/src/routes/auth.route.ts の既存文言と完全に揃える。
            throw new APIError("BAD_REQUEST", {
              message:
                "アカウントの登録に失敗しました。時間を置いて再度お試しください。",
            });
          }
          return { data: user };
        },
        after: async (user) => {
          // user 行が DB に挿入された直後に同期実行される。
          // ここで throw すると Better Auth は sign-up 全体を fail させてしまうため、
          // 万一の DB 一時障害でユーザーを返さなくなるリスクを避けて warn-only にする。
          // 失敗時は session.create.before で organization 引き当てができず
          // activeOrganizationId が undefined のまま session が作られるが、
          // /dashboard 側 (sign-in-form の onSuccess) が list+setActive で救う設計。
          try {
            await bootstrapPersonalOrganization(user.id);
          } catch (err) {
            console.error(
              "[databaseHooks.user.create.after] failed to bootstrap organization:",
              err,
            );
          }
        },
      },
      update: {
        before: async (data, ctx) => {
          // クライアントから authClient.updateUser({ image }) で `user.image` を任意の URL に
          // 書き換えられないように reject する。built-in field のため additionalFields の
          // `input: false` が効かず、hook で守る必要がある (better-auth v1.6 仕様)。
          //
          // プロフィール画像の更新は /api/account/avatar (server route) 経由でのみ受け付け、
          // そこでは drizzle で user 行を直接 update することで本 hook をバイパスする設計。
          //
          // ctx.context.session が存在する = 認証済みクライアントからの API 呼び出し。
          // 存在しない = better-auth 内部処理 (OAuth callback / linkAccount での
          // mapProfileToUser に伴う image 同期等) なので、そちらは通す。
          if (
            ctx?.context?.session &&
            (data as { image?: unknown }).image !== undefined
          ) {
            throw new APIError("BAD_REQUEST", {
              message: "プロフィール画像はこのエンドポイントから変更できません",
            });
          }
          return { data };
        },
      },
    },
    session: {
      create: {
        before: async (session) => {
          // 既に上位 (Better Auth の組織プラグイン等) が activeOrganizationId を
          // セットしていれば尊重する。
          if (session.activeOrganizationId) {
            return { data: session };
          }
          const orgId = await getOldestOrganizationIdForUser(session.userId);
          return {
            data: orgId ? { ...session, activeOrganizationId: orgId } : session,
          };
        },
      },
    },
  },
  plugins: [
    organization({
      ac,
      roles: { owner, admin, member },
      // 招待の承認/拒否前にメールアドレス確認を必須化する。
      // better-auth 1.6.9 の crud-invites では本フラグが明示 true でない限り
      // `requireEmailVerificationOnInvitation && !emailVerified` の条件が成立せず、
      // 未検証メールでも招待を accept できてしまう (組織横取りに直結はしないが、
      // 「招待 email を一時的に占有しただけ」のユーザーが入れてしまう余地が残る)。
      // また 1.6.9 では accept/reject の前段で `invitation.email == session.user.email`
      // を必ず一致確認しているため、本フラグが「招待を受けられる人物の同一性保証」を
      // 完成させる位置づけになる。
      requireEmailVerificationOnInvitation: true,
      async sendInvitationEmail(data) {
        try {
          const resend = new Resend(env.RESEND_API_KEY);
          // 招待リンクはフロントエンド (Next.js) のページなので、CORS_ORIGIN の
          // 1 番目をフロント origin として使う。BETTER_AUTH_URL は Better Auth
          // ハンドラの URL (Hono server) なのでここでは使わない。
          const frontendOrigin =
            env.CORS_ORIGIN.split(",")[0]?.trim() ?? env.BETTER_AUTH_URL;
          const inviteLink = `${frontendOrigin}/invitation/${data.id}`;
          const { error } = await resend.emails.send({
            from: env.FROM_EMAIL,
            to: [data.email],
            subject: invitationEmailSubject({
              inviterName: data.inviter.user.name,
              organizationName: data.organization.name,
            }),
            html: invitationEmailHtml({
              inviterName: data.inviter.user.name,
              inviterEmail: data.inviter.user.email,
              organizationName: data.organization.name,
              role: data.role,
              inviteUrl: inviteLink,
            }),
          });
          if (error) {
            console.error("[sendInvitationEmail] Resend API error:", error);
          }
        } catch (e) {
          console.error("[sendInvitationEmail] Failed to send email:", e);
        }
      },
    }),
    // 最後に使ったログイン方法 (email / google) を non-httpOnly cookie に保存し、
    // sign-in ページで「前回利用」ヒントを出すために使う。
    // - storeInDatabase は無効: ログイン前のヒント表示は cookie だけで完結し、
    //   DB に持つ運用負担 (#4627 の更新欠落バグ等) を取らない判断。
    // - cookie 属性は better-auth/dist/plugins/last-login-method/index.mjs:65 で
    //   sessionToken の attributes を継承する。advanced.defaultCookieAttributes の
    //   sameSite=none / secure / domain が自動で適用され、httpOnly のみ false に
    //   差し替えられる (クライアント JS から authClient.getLastUsedLoginMethod() で
    //   読む必要があるため)。
    // - 1.6.9 の after hook は「sessionToken cookie が同レスポンスでセットされた時のみ」
    //   last_used cookie を書く実装になっており、認証失敗時の cookie 書き込み (#4626)
    //   は修正済み。
    lastLoginMethod(),
  ],
  hooks: {
    // /unlink-account の成功時に last_used_login_method cookie を確実に削除する。
    //
    // 公式 client の `authClient.clearLastUsedLoginMethod()` は実装が
    //   `document.cookie = <name>=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`
    // で Domain 属性を付けないため、`advanced.defaultCookieAttributes.domain` を
    // 介して `Domain=.${env.COOKIE_DOMAIN}` で発行された本 cookie を削除できない
    // (RFC 6265: cookie の同一性は (name, domain, path) の三つ組。Domain なしの
    //  deletion は host-only cookie の新規作成扱いになり、元の domain-scoped cookie
    //  はそのまま残る)。
    //
    // ここではサーバが session token と同じ Domain/Path/Secure/SameSite で
    // maxAge=0 の Set-Cookie をレスポンスに乗せ、ブラウザに正しい識別子で
    // 削除させる。
    after: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/unlink-account") return;
      // FAILED_TO_UNLINK_LAST_ACCOUNT / ACCOUNT_NOT_FOUND 等で連携が残った場合は
      // cookie のヒントも残す方が整合する。endpoint は失敗時 APIError を throw し、
      // returned に Error を残すのでそれをチェックする。
      const returned = ctx.context.returned;
      if (!returned || returned instanceof Error) return;
      // 解除する provider と「最後に使ったログイン方法」の現値が一致する時のみ
      // 削除する。例えば「最後 email でログイン → 後から Google を連携 → Google を解除」
      // のシナリオでは cookie は "email" のままなので、ここで消すとサインイン画面の
      // email 側「前回利用」バッジまで失われてしまう。
      // (linkSocial は既存セッション継続のため session token cookie が新規発行されず、
      //  プラグインの after hook は last_used_login_method を更新しない。
      //  ref: better-auth/dist/plugins/last-login-method/index.mjs:65)
      const unlinkedProvider = ctx.body?.providerId;
      const currentMethod = ctx.getCookie("better-auth.last_used_login_method");
      if (!unlinkedProvider || unlinkedProvider !== currentMethod) return;
      ctx.setCookie("better-auth.last_used_login_method", "", {
        ...ctx.context.authCookies.sessionToken.attributes,
        // 本 cookie は元から client JS で読まれる前提なので httpOnly:false で出ている。
        // 同じ属性で deletion を出さないとブラウザによっては merge 扱いされないため
        // 揃えておく。
        httpOnly: false,
        maxAge: 0,
      });
    }),
  },
  session: {
    cookieCache: {
      enabled: true,
      maxAge: 60,
    },
  },
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  advanced: {
    defaultCookieAttributes: {
      // SameSite=None: 3rd-party iframe (Notion / Confluence 等) で動画を視聴可能にするため。
      //
      // - Lax だと cross-site context (iframe / popup) で cookie が一切送られず、
      //   さらに Chrome は Storage Access API が active でも SameSite=Lax cookie を
      //   無視するため、embed 認証が成立しない。
      //   refs: https://privacysandbox.google.com/cookies/storage-access-api
      // - None + Secure に変更することで:
      //   * default Chrome: 3rd-party iframe で cookie が直接送られ、ログイン中ユーザーは
      //     ボタン操作なしで動画が再生される
      //   * Safari (ITP) / Firefox (TCP) / 3rd-party cookie ブロック設定の Chrome:
      //     popup ログイン + Storage Access API のフォールバック動線が機能する
      //
      // 実装上のトレードオフ: cookie が cross-site で送られるようになるが、
      //   - 状態変更系 API は CORS allowlist + Better Auth の CSRF 保護で守られる
      //   - 共有 token は cuid2 で推測困難
      sameSite: "none",
      secure: true,
      httpOnly: true,
      ...(env.COOKIE_DOMAIN ? { domain: `.${env.COOKIE_DOMAIN}` } : {}),
    },
  },
});
