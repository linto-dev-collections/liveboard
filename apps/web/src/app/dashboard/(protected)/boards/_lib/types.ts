export type BoardSort = "recent" | "title";

/** ダッシュボード一覧の 1 タイル（server の BoardListItem と対応）。 */
export type BoardListItem = {
  id: string;
  title: string;
  thumbnailKey: string | null;
  /** epoch ミリ秒。 */
  lastActivityAt: number;
  isFavorite: boolean;
};
