"use client";

import "@excalidraw/excalidraw/index.css";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { Button } from "@liveboard/ui/components/ui/button";
import { MessageSquareIcon } from "lucide-react";
import dynamic from "next/dynamic";
import { useTheme } from "next-themes";
import { useEffect, useRef, useState } from "react";
import { Participants } from "./_components/participants";
import { ToolbarExtras } from "./_components/toolbar-extras";
import { BoardFiles, generateFileId } from "./_lib/files";
import { BoardPresence } from "./_lib/presence";
import { SceneChangeBus } from "./_lib/scene-bus";
import { BoardSyncEngine } from "./_lib/sync-engine";
import { ThumbnailManager } from "./_lib/thumbnail";
import type { BoardRole } from "./_lib/types";

// Excalidraw は window 依存のため SSR 無効で動的 import する。
const Excalidraw = dynamic(
  () =>
    import("@excalidraw/excalidraw").then((m) => ({ default: m.Excalidraw })),
  { ssr: false },
);

// コメントオーバーレイも Excalidraw の座標変換を静的 import するため SSR 無効で読み込む。
const BoardComments = dynamic(
  () =>
    import("./_features/comments").then((m) => ({ default: m.BoardComments })),
  { ssr: false },
);

export function BoardCanvas({
  boardId,
  serverUrl,
  role,
}: {
  boardId: string;
  serverUrl: string;
  role: BoardRole;
}) {
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  // presence は renderTopRightUI が参照するため state（生成時に再レンダーさせる）。
  const [presence, setPresence] = useState<BoardPresence | null>(null);
  // engine は BoardComments に渡すため state（生成時に一度だけ再レンダー）。
  const [engine, setEngine] = useState<BoardSyncEngine | null>(null);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const engineRef = useRef<BoardSyncEngine | null>(null);
  const filesRef = useRef<BoardFiles | null>(null);
  const thumbnailRef = useRef<ThumbnailManager | null>(null);
  // board onChange を BoardComments へ通知するバス（ピン射影の再計算用・stable）。
  const [sceneBus] = useState(() => new SceneChangeBus());
  const canEdit = role === "owner" || role === "editor";

  // アプリのテーマ（next-themes・storageKey "theme" で永続化済み）を Excalidraw に同期する。
  // theme prop を渡すと Excalidraw のテーマは host 制御になり、Excalidraw 内蔵のテーマトグルは
  // 隠れる（単一の真実 = ヘッダの ThemeToggle）。resolvedTheme は "system" を light/dark に解決する。
  const { resolvedTheme } = useTheme();
  const excalidrawTheme = resolvedTheme === "dark" ? "dark" : "light";

  useEffect(() => {
    if (!api) return;
    const engine = new BoardSyncEngine({ serverUrl, boardId, api, canEdit });
    const presenceEngine = new BoardPresence({ api, transport: engine });
    engine.setPresenceSink(presenceEngine);
    engineRef.current = engine;
    setEngine(engine);
    setPresence(presenceEngine);

    // 画像アセット（アップロード/受信）。受信は全ロール、アップロードは編集操作からのみ発生。
    const files = new BoardFiles({ api, serverUrl, boardId });
    filesRef.current = files;
    // サムネ生成は canEdit のみ（viewer の PUT はサーバが 403）。
    const thumbnail = canEdit
      ? new ThumbnailManager({ api, serverUrl, boardId })
      : null;
    thumbnailRef.current = thumbnail;

    engine.connect();
    return () => {
      engine.dispose();
      presenceEngine.dispose();
      files.dispose();
      thumbnail?.dispose();
      engineRef.current = null;
      filesRef.current = null;
      thumbnailRef.current = null;
      setEngine(null);
      setPresence(null);
    };
  }, [api, serverUrl, boardId, canEdit]);

  return (
    <div className="relative h-[calc(100svh-4rem)] w-full">
      <Excalidraw
        excalidrawAPI={(value) => setApi(value)}
        // アプリのライト/ダークと同期（host 制御）。永続化は next-themes が担う。
        theme={excalidrawTheme}
        // 画像挿入時に内容ハッシュで決定論的に fileId を決める（R2 キーと 1:1）。
        generateIdForFile={generateFileId}
        onChange={(_elements, appState) => {
          engineRef.current?.onLocalChange();
          presence?.handleSceneChange(appState);
          filesRef.current?.handleSceneChange();
          thumbnailRef.current?.notifyChange();
          // コメントピンの再射影（要素移動の追従）。
          sceneBus.emit();
        }}
        onPointerUpdate={(payload) => presence?.handlePointerUpdate(payload)}
        // viewer は読み取り専用（UX 層・強制力は DO 側 M6）。
        viewModeEnabled={!canEdit}
        isCollaborating
        renderTopRightUI={() => (
          <div className="flex items-center gap-2">
            {canEdit && api ? <ToolbarExtras api={api} /> : null}
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="コメント"
              aria-pressed={commentsOpen}
              onClick={() => setCommentsOpen((o) => !o)}
            >
              <MessageSquareIcon />
            </Button>
            {presence ? <Participants presence={presence} /> : null}
          </div>
        )}
      />
      {api && engine ? (
        <BoardComments
          api={api}
          engine={engine}
          boardId={boardId}
          serverUrl={serverUrl}
          role={role}
          open={commentsOpen}
          onOpenChange={setCommentsOpen}
          sceneBus={sceneBus}
        />
      ) : null}
    </div>
  );
}
