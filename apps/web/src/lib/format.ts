import { FORMAT, jst } from "@liveboard/shared/date";

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
  }).format(amount);
}

export function formatDate(date: string | Date): string {
  return jst(date).format(FORMAT.DATE_SLASH);
}

export function formatDateTime(date: string | Date): string {
  return jst(date).format(FORMAT.DATETIME_SLASH);
}

export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("ja-JP").format(value);
}

/**
 * ミリ秒を "MM:SS" または "HH:MM:SS" 形式にフォーマットする。
 * null の場合は "—" を返す。
 */
export function formatDuration(ms: number | null): string {
  if (ms === null) return "—";
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/**
 * バイト数を人間が読みやすい形式にフォーマットする。
 * null の場合は "—" を返す。
 */
export function formatFileSize(bytes: number | null): string {
  if (bytes === null) return "—";
  if (bytes === 0) return "0 B";

  const units = ["B", "KB", "MB", "GB"];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const size = bytes / k ** i;

  return `${size.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

/**
 * 文字列を最大長を超えたら末尾を「…」に置き換える。
 *
 * Tailwind の `truncate` は親要素の幅に依存するため、画面幅が広いと
 * 長文タイトルが一切省略されないことがある。表示密度を一定に保つため
 * 文字数ベースのハードリミットを併用する。
 *
 * 絵文字や合字を含む文字列でもサロゲートペアが分断されないよう、
 * `Array.from` で code point 単位に分割してからスライスする。
 */
export function truncate(str: string, max: number): string {
  const chars = Array.from(str);
  if (chars.length <= max) return str;
  return `${chars.slice(0, max).join("")}…`;
}

/**
 * 期限までの残り日数を「あと N 日」「あと数時間」「期限切れ」で返す。
 * - now > expiresAt: "期限切れ"
 * - 1 日未満: "あと数時間"
 * - 1 日以上: "あと N 日"
 */
export function formatRetentionRemaining(
  expiresAt: string | Date,
  now: Date = new Date(),
): string {
  const exp = typeof expiresAt === "string" ? new Date(expiresAt) : expiresAt;
  const ms = exp.getTime() - now.getTime();
  if (ms <= 0) return "期限切れ";
  const day = 24 * 60 * 60 * 1000;
  if (ms < day) return "あと数時間";
  return `あと ${Math.floor(ms / day)} 日`;
}

/**
 * ISO 文字列を相対時間表示にフォーマットする。
 * 例: "たった今", "3分前", "1時間前", "2日前", "2024/04/14"
 */
export function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return "たった今";
  if (diffMin < 60) return `${diffMin}分前`;
  if (diffHour < 24) return `${diffHour}時間前`;
  if (diffDay < 7) return `${diffDay}日前`;

  return date.toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}
