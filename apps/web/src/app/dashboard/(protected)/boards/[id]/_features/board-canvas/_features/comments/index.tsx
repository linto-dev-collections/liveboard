"use client";

import {
  sceneCoordsToViewportCoords,
  viewportCoordsToSceneCoords,
} from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { Button } from "@liveboard/ui/components/ui/button";
import { XIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/components/auth-provider";
import type { SceneChangeBus } from "../../_lib/scene-bus";
import type { BoardSyncEngine } from "../../_lib/sync-engine";
import type { BoardRole } from "../../_lib/types";
import { CommentComposer } from "./_components/comment-composer";
import { CommentPin } from "./_components/comment-pin";
import { CommentsSheet } from "./_components/comments-sheet";
import {
  addComment,
  CommentApiError,
  createThread,
  deleteComment,
  fetchMentionable,
  listThreads,
  resolveThread,
  updateComment,
} from "./_lib/api";
import type {
  CommentThread,
  CommentWsMessage,
  NotificationWsMessage,
} from "./_lib/types";

/** placement 中に配置予定の anchor + 画面位置（container 相対 px）。 */
type DraftAnchor =
  | { kind: "element"; elementId: string; screen: { x: number; y: number } }
  | {
      kind: "point";
      x: number;
      y: number;
      screen: { x: number; y: number };
    };

type Props = {
  api: ExcalidrawImperativeAPI;
  engine: BoardSyncEngine;
  boardId: string;
  serverUrl: string;
  role: BoardRole;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sceneBus: SceneChangeBus;
};

/**
 * コメント機能の中核（ピン射影・サイドバー・@メンション・WS 反映）。
 * board-canvas から `dynamic(ssr:false)` で読み込まれる（Excalidraw 座標変換を静的 import するため）。
 * D1 が正本で、自分の操作は HTTP レスポンスで即時反映しつつ WS でも収束する。
 */
export function BoardComments({
  api,
  engine,
  boardId,
  serverUrl,
  role,
  open,
  onOpenChange,
  sceneBus,
}: Props) {
  const { session } = useAuth();
  const currentUserId = session?.user.id ?? null;
  const canManage = role === "owner";

  const [threads, setThreads] = useState<CommentThread[]>([]);
  const [positions, setPositions] = useState<
    Record<string, { x: number; y: number }>
  >({});
  const [openThreadId, setOpenThreadId] = useState<string | null>(null);
  const [placement, setPlacement] = useState(false);
  const [draft, setDraft] = useState<DraftAnchor | null>(null);

  const threadsRef = useRef<CommentThread[]>([]);
  const rafRef = useRef<number | null>(null);

  const mentionableFor = useCallback(
    (q: string) => fetchMentionable(serverUrl, boardId, q),
    [serverUrl, boardId],
  );

  // ---- ピン射影（scene → container 相対 px） ----

  const computePositions = useCallback(() => {
    const appState = api.getAppState();
    const result: Record<string, { x: number; y: number }> = {};
    let elementIndex: Map<string, { x: number; y: number }> | null = null;
    for (const thread of threadsRef.current) {
      let sceneX: number;
      let sceneY: number;
      if (thread.anchorKind === "element" && thread.anchorElementId) {
        if (!elementIndex) {
          elementIndex = new Map();
          for (const el of api.getSceneElements()) {
            elementIndex.set(el.id, { x: el.x, y: el.y });
          }
        }
        const el = elementIndex.get(thread.anchorElementId);
        if (!el) continue; // 要素が削除された → ピン非表示（サイドバーには残る）
        sceneX = el.x;
        sceneY = el.y;
      } else if (thread.anchorX !== null && thread.anchorY !== null) {
        sceneX = thread.anchorX;
        sceneY = thread.anchorY;
      } else {
        continue;
      }
      const vp = sceneCoordsToViewportCoords({ sceneX, sceneY }, appState);
      result[thread.id] = {
        x: vp.x - appState.offsetLeft,
        y: vp.y - appState.offsetTop,
      };
    }
    setPositions(result);
  }, [api]);

  const scheduleRecompute = useCallback(() => {
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      computePositions();
    });
  }, [computePositions]);

  useEffect(() => {
    threadsRef.current = threads;
    scheduleRecompute();
  }, [threads, scheduleRecompute]);

  // pan/zoom（onScrollChange）・要素移動（sceneBus）・リサイズで再射影する。
  useEffect(() => {
    const unsubBus = sceneBus.subscribe(scheduleRecompute);
    const unsubScroll = api.onScrollChange(() => scheduleRecompute());
    const onResize = () => scheduleRecompute();
    window.addEventListener("resize", onResize);
    scheduleRecompute();
    return () => {
      unsubBus();
      unsubScroll();
      window.removeEventListener("resize", onResize);
      // cancel した frame id を null に戻す。これを怠ると StrictMode（dev）の
      // mount→cleanup→再mount で rafRef が古い非 null のまま残り、scheduleRecompute が
      // 早期 return し続けて computePositions が二度と走らない（＝ピンが描画されない）。
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [api, sceneBus, scheduleRecompute]);

  // ---- スレッド state 更新 ----

  const upsertThread = useCallback((thread: CommentThread) => {
    setThreads((prev) => {
      const i = prev.findIndex((t) => t.id === thread.id);
      if (i === -1) return [...prev, thread];
      const next = prev.slice();
      next[i] = thread;
      return next;
    });
  }, []);

  const removeThread = useCallback((threadId: string) => {
    setThreads((prev) => prev.filter((t) => t.id !== threadId));
  }, []);

  // 初期ロード
  useEffect(() => {
    let cancelled = false;
    listThreads(serverUrl, boardId)
      .then((t) => {
        if (!cancelled) setThreads(t);
      })
      .catch(() => {
        if (!cancelled) toast.error("コメントの読み込みに失敗しました");
      });
    return () => {
      cancelled = true;
    };
  }, [serverUrl, boardId]);

  // WS（COMMENT/NOTIFICATION）の受信
  useEffect(() => {
    engine.setCommentSink({
      handleMessage: (msg) => {
        if (msg.type === "COMMENT") {
          const m = msg as unknown as CommentWsMessage;
          if (m.threadDeleted && m.threadId) {
            removeThread(m.threadId);
            return;
          }
          if (m.thread) upsertThread(m.thread);
          return;
        }
        // NOTIFICATION（被メンション即時通知）
        const m = msg as unknown as NotificationWsMessage;
        const actor = m.notification.actorName ?? "誰か";
        toast(`${actor} さんがあなたをメンションしました`, {
          description: m.notification.commentBody,
        });
      },
    });
    return () => engine.setCommentSink(null);
  }, [engine, upsertThread, removeThread]);

  // ---- アクション ----

  const handleApiError = useCallback((error: unknown) => {
    const message =
      error instanceof CommentApiError ? error.message : "操作に失敗しました";
    toast.error(message);
  }, []);

  const projectScene = useCallback(
    (sceneX: number, sceneY: number) => {
      const appState = api.getAppState();
      const vp = sceneCoordsToViewportCoords({ sceneX, sceneY }, appState);
      return { x: vp.x - appState.offsetLeft, y: vp.y - appState.offsetTop };
    },
    [api],
  );

  // 「コメントを追加」: 単一要素を選択中なら要素アンカー、なければ point 配置モードへ。
  const startAdd = useCallback(() => {
    onOpenChange(false);
    const appState = api.getAppState();
    const selected = Object.keys(appState.selectedElementIds ?? {});
    if (selected.length === 1) {
      const id = selected[0];
      const el = api.getSceneElements().find((e) => e.id === id);
      if (el) {
        setDraft({
          kind: "element",
          elementId: id,
          screen: projectScene(el.x, el.y),
        });
        return;
      }
    }
    setPlacement(true);
  }, [api, onOpenChange, projectScene]);

  // placement 中のキャンバスクリック → point アンカー確定
  const placePoint = useCallback(
    (clientX: number, clientY: number, rect: DOMRect) => {
      const appState = api.getAppState();
      const scene = viewportCoordsToSceneCoords({ clientX, clientY }, appState);
      setPlacement(false);
      setDraft({
        kind: "point",
        x: scene.x,
        y: scene.y,
        screen: { x: clientX - rect.left, y: clientY - rect.top },
      });
    },
    [api],
  );

  // placement の Esc キャンセル
  useEffect(() => {
    if (!placement) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPlacement(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [placement]);

  const submitNewThread = useCallback(
    async (body: string, mentionedUserIds: string[]) => {
      if (!draft) return;
      try {
        const thread = await createThread(serverUrl, boardId, {
          anchorKind: draft.kind,
          anchorElementId:
            draft.kind === "element" ? draft.elementId : undefined,
          anchorX: draft.kind === "point" ? draft.x : undefined,
          anchorY: draft.kind === "point" ? draft.y : undefined,
          body,
          mentionedUserIds,
        });
        upsertThread(thread);
        setDraft(null);
        setOpenThreadId(thread.id);
      } catch (error) {
        handleApiError(error);
      }
    },
    [draft, serverUrl, boardId, upsertThread, handleApiError],
  );

  const reply = useCallback(
    async (threadId: string, body: string, mentionedUserIds: string[]) => {
      try {
        upsertThread(
          await addComment(serverUrl, boardId, threadId, {
            body,
            mentionedUserIds,
          }),
        );
      } catch (error) {
        handleApiError(error);
      }
    },
    [serverUrl, boardId, upsertThread, handleApiError],
  );

  const resolve = useCallback(
    async (threadId: string, resolved: boolean) => {
      try {
        upsertThread(
          await resolveThread(serverUrl, boardId, threadId, resolved),
        );
      } catch (error) {
        handleApiError(error);
      }
    },
    [serverUrl, boardId, upsertThread, handleApiError],
  );

  const editComment = useCallback(
    async (commentId: string, body: string) => {
      try {
        upsertThread(await updateComment(serverUrl, boardId, commentId, body));
      } catch (error) {
        handleApiError(error);
      }
    },
    [serverUrl, boardId, upsertThread, handleApiError],
  );

  // 楽観削除: コメントを除去し、スレッドが空になればスレッドごと除去（WS でも収束）。
  const removeComment = useCallback(
    async (commentId: string) => {
      try {
        await deleteComment(serverUrl, boardId, commentId);
        setThreads((prev) =>
          prev
            .map((t) => ({
              ...t,
              comments: t.comments.filter((c) => c.id !== commentId),
            }))
            .filter((t) => t.comments.length > 0),
        );
      } catch (error) {
        handleApiError(error);
      }
    },
    [serverUrl, boardId, handleApiError],
  );

  const jumpTo = useCallback(
    (threadId: string) => {
      onOpenChange(false);
      setOpenThreadId(threadId);
    },
    [onOpenChange],
  );

  return (
    <>
      {/* ピンオーバーレイ（クリックはピンのみ通す）。
          Excalidraw の `.excalidraw` はスタッキングコンテキストを作らないため、canvas(z-index 1–2)が
          素の z-auto オーバーレイより前面に来てピンが隠れる。canvas より前・toolbar(z-index 4)より背面の
          z-[3] に置く（ポップオーバーは portal で z-50 のため本文は最前面に出る）。 */}
      <div className="pointer-events-none absolute inset-0 z-[3] overflow-hidden">
        {threads.map((thread) => {
          const pos = positions[thread.id];
          if (!pos) return null;
          return (
            <CommentPin
              key={thread.id}
              thread={thread}
              position={pos}
              open={openThreadId === thread.id}
              onOpenChange={(o) => setOpenThreadId(o ? thread.id : null)}
              currentUserId={currentUserId}
              canManage={canManage}
              fetchMentionable={mentionableFor}
              onReply={(body, ids) => reply(thread.id, body, ids)}
              onResolve={(resolved) => resolve(thread.id, resolved)}
              onEdit={editComment}
              onDelete={removeComment}
            />
          );
        })}
      </div>

      {/* placement キャプチャ（次クリックで point 配置・キーボードは Esc で解除） */}
      {placement ? (
        <button
          type="button"
          aria-label="クリックしてコメントを配置"
          className="absolute inset-0 z-10 cursor-crosshair bg-primary/5"
          onClick={(e) =>
            placePoint(
              e.clientX,
              e.clientY,
              e.currentTarget.getBoundingClientRect(),
            )
          }
        >
          <span className="absolute top-3 left-1/2 -translate-x-1/2 rounded-full bg-foreground px-3 py-1.5 text-background text-xs shadow">
            クリックしてコメントを配置（Esc でキャンセル）
          </span>
        </button>
      ) : null}

      {/* 新規スレッド作成カード */}
      {draft ? (
        <div
          className="pointer-events-auto absolute z-20 w-80 translate-y-2 rounded-xl border border-border bg-popover p-3 shadow-xl"
          style={{ left: draft.screen.x, top: draft.screen.y }}
        >
          <div className="mb-2 flex items-center justify-between">
            <span className="font-medium text-sm">新しいコメント</span>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="キャンセル"
              onClick={() => setDraft(null)}
            >
              <XIcon />
            </Button>
          </div>
          <CommentComposer
            onSubmit={submitNewThread}
            fetchMentionable={mentionableFor}
            placeholder="コメントを入力（@ でメンション）"
            submitLabel="コメント"
            autoFocus
          />
        </div>
      ) : null}

      {/* サイドバー */}
      <CommentsSheet
        open={open}
        onOpenChange={onOpenChange}
        threads={threads}
        onJump={jumpTo}
        onResolve={resolve}
        onAddComment={startAdd}
      />
    </>
  );
}
