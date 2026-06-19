import {
  createLoader,
  parseAsBoolean,
  parseAsString,
  parseAsStringLiteral,
} from "nuqs/server";

/**
 * ボード一覧の URL state パーサ定義（page=server / toolbar=client で共有）。
 * nuqs/server は server-only 依存を持たないためクライアントからも import 可能。
 */
export const boardsSearchParsers = {
  q: parseAsString.withDefault(""),
  favorite: parseAsBoolean.withDefault(false),
  sort: parseAsStringLiteral(["recent", "title"] as const).withDefault(
    "recent",
  ),
};

/** page.tsx で searchParams を型安全に展開するためのローダ。 */
export const loadBoardsSearchParams = createLoader(boardsSearchParsers);
