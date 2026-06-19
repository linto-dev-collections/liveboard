/**
 * 秒数をタイムスタンプ文字列にフォーマットする。
 * 60 分未満: "mm:ss"、60 分以上: "h:mm:ss"
 *
 * dashboard / share の双方の文字起こしパネルで使うため `src/lib/` に置く
 * (Route Group 越え import を避けるため)。
 */
export function formatTimestamp(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);

  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
