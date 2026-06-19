import type { MentionableUser } from "./types";

/**
 * `@メンション` のテキスト操作ヘルパー（純関数）。
 *
 * - 入力中の `@token`（キャレット直前・空白を挟まない）を検出して補完候補を引く。
 * - 候補確定時に `@表示名 ` を差し込み、選択ユーザーを記録する。
 * - 送信時、本文に `@表示名` が残っているメンションのみ userId を抽出する。
 */

/** キャレット直前のアクティブな `@token` を返す（無ければ null）。 */
export function getActiveMentionQuery(
  text: string,
  caret: number,
): { query: string; start: number } | null {
  // キャレットから後方へ `@` を探す。`@` の直前は行頭か空白でなければならない。
  for (let i = caret - 1; i >= 0; i--) {
    const ch = text[i];
    if (ch === "@") {
      const prev = i > 0 ? text[i - 1] : " ";
      if (prev === " " || prev === "\n" || prev === "\t") {
        return { query: text.slice(i + 1, caret), start: i };
      }
      return null;
    }
    // 空白/改行に当たったら token 終端（@ より手前まで遡らない）。
    if (ch === " " || ch === "\n" || ch === "\t") return null;
  }
  return null;
}

/** `@token`（start..caret）を `@表示名 ` に置換し、新しい本文とキャレット位置を返す。 */
export function applyMention(
  text: string,
  start: number,
  caret: number,
  user: MentionableUser,
): { text: string; caret: number } {
  const insert = `@${user.name} `;
  const next = text.slice(0, start) + insert + text.slice(caret);
  return { text: next, caret: start + insert.length };
}

/**
 * 本文と「これまで選択したメンション」から、現在も本文に `@表示名` が残っている
 * userId を抽出する（重複排除）。本文から削除されたメンションは送らない。
 */
export function extractMentionedUserIds(
  text: string,
  selected: MentionableUser[],
): string[] {
  const ids = new Set<string>();
  for (const u of selected) {
    if (text.includes(`@${u.name}`)) ids.add(u.userId);
  }
  return [...ids];
}
