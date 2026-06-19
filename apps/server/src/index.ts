import { getServerByName, routePartykitRequest } from "partyserver";
import app from "./app";
import { authorizeBoardConnection } from "./connect-auth";
import { runScheduledMaintenance } from "./maintenance";
import type { AppEnv } from "./types";

// Board Durable Object クラスは Worker エントリポイントの名前付き export として
// 公開する必要がある（Cloudflare 要件）。
export { Board } from "./realtime/board-server";

/** `/parties/board/<room>` の room（= boardId）を取り出す。それ以外は null。 */
function boardRoomOf(request: Request): string | null {
  const parts = new URL(request.url).pathname.split("/").filter(Boolean);
  if (parts[0] !== "parties" || parts[1] !== "board") return null;
  return parts[2] ?? null;
}

export default {
  async fetch(
    request: Request,
    env: AppEnv["Bindings"],
    ctx: ExecutionContext,
  ): Promise<Response> {
    const room = boardRoomOf(request);
    if (room) {
      // routePartykitRequest はルーム名を ctx.id.name に依存するが、ローカル（alchemy 同梱の
      // 旧 miniflare）や古い compat date では undefined になり得る。接続前に getServerByName
      // （内部で setName）を呼んで __ps_name を永続化し、初回・ハイバネーション復帰のいずれでも
      // this.name を解決できるようにする（新環境では同名 no-op）。
      await getServerByName(env.Board, room);
    }
    // /parties/board/:boardId は Board DO へ（onBeforeConnect で入室認証 + 識別ヘッダ付与）。
    // それ以外は Hono へ。
    const partyResponse = await routePartykitRequest(request, env, {
      onBeforeConnect: (req, lobby) =>
        authorizeBoardConnection(req, env, lobby.name),
    });
    return partyResponse ?? app.fetch(request, env, ctx);
  },

  /**
   * Cron Trigger（alchemy `crons`・例 1 分間隔）。削除 Saga・アセット GC・孤児回収を
   * バックグラウンドで 1 ステップ進める（Phase 6-1）。同時実行はジョブ単位のリースで排他。
   */
  async scheduled(
    _controller: ScheduledController,
    env: AppEnv["Bindings"],
    ctx: ExecutionContext,
  ): Promise<void> {
    ctx.waitUntil(runScheduledMaintenance(env));
  },
} satisfies ExportedHandler<AppEnv["Bindings"]>;

export type { AppType } from "./app";
