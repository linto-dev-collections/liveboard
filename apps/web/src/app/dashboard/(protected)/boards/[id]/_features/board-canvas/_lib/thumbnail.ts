import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

/** 編集が落ち着いてからサムネを生成するデバウンス間隔。 */
const THUMBNAIL_DEBOUNCE_MS = 10_000;
/** サムネの最大辺（px）。ダッシュボードのタイル用に小さく出力する。 */
const THUMBNAIL_MAX_DIM = 512;

export type ThumbnailOptions = {
  api: ExcalidrawImperativeAPI;
  serverUrl: string;
  boardId: string;
};

/**
 * サムネ生成（4-5）。編集の落ち着き（デバウンス）と離脱時に `exportToBlob` で PNG を作り、
 * `PUT /api/boards/:id/thumbnail` へ送る。サーバが `board.thumbnail_key`＋manifest を整合更新する。
 * 生成は **canEdit のときのみ**（viewer の PUT はサーバが 403）。
 */
export class ThumbnailManager {
  private readonly api: ExcalidrawImperativeAPI;
  private readonly serverUrl: string;
  private readonly boardId: string;

  private timer: ReturnType<typeof setTimeout> | null = null;
  private dirty = false;
  private scheduling = true;

  constructor(opts: ThumbnailOptions) {
    this.api = opts.api;
    this.serverUrl = opts.serverUrl;
    this.boardId = opts.boardId;
  }

  /** `onChange` から呼ぶ。最後の変更から一定時間後に 1 度だけ生成する（デバウンス）。 */
  notifyChange(): void {
    if (!this.scheduling) return;
    this.dirty = true;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.generate();
    }, THUMBNAIL_DEBOUNCE_MS);
  }

  private async generate(): Promise<void> {
    if (!this.dirty) return;
    const elements = this.api.getSceneElements();
    if (elements.length === 0) return; // 空ボードはサムネを更新しない
    this.dirty = false;
    try {
      const { exportToBlob } = await import("@excalidraw/excalidraw");
      const blob = await exportToBlob({
        elements,
        appState: {
          ...this.api.getAppState(),
          exportBackground: true,
          exportWithDarkMode: false,
        },
        files: this.api.getFiles(),
        mimeType: "image/png",
        maxWidthOrHeight: THUMBNAIL_MAX_DIM,
      });
      await fetch(`${this.serverUrl}/api/boards/${this.boardId}/thumbnail`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "image/png" },
        body: blob,
      });
    } catch (error) {
      console.error("[thumbnail] generate failed", error);
    }
  }

  dispose(): void {
    this.scheduling = false;
    if (this.timer !== null) clearTimeout(this.timer);
    // 離脱時に未保存の変更があれば best-effort で 1 度だけ生成する。
    if (this.dirty) void this.generate();
  }
}
