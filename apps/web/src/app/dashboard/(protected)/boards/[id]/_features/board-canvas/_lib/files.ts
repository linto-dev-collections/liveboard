import type { FileId } from "@excalidraw/excalidraw/element/types";
import type {
  BinaryFileData,
  DataURL,
  ExcalidrawImperativeAPI,
} from "@excalidraw/excalidraw/types";

/** 受信画像取得のスロットル間隔（本家 `loadImageFiles` 踏襲）。 */
const LOAD_THROTTLE_MS = 500;

/** 恒久失敗（再アップロード不要）の HTTP ステータス。 */
const PERMANENT_FAILURE = new Set([409, 413, 415]);

/**
 * `<Excalidraw generateIdForFile>` 用の **決定論的 fileId**。
 * 内容の SHA-256（hex）を ID にすることで R2 キーと 1:1 対応し、同一画像を重複保存しない。
 */
export async function generateFileId(file: File): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    await file.arrayBuffer(),
  );
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export type BoardFilesOptions = {
  api: ExcalidrawImperativeAPI;
  serverUrl: string;
  boardId: string;
};

/**
 * 画像アセットのアップロード/受信を担うクライアント。
 *
 * - **アップロード**: `status:'pending'` の画像要素を検出し、ローカルの dataURL を
 *   `POST /api/boards/:id/assets` に送る。成功で要素を `status:'saved'` に更新（version bump）。
 * - **受信**: `status:'saved'` で未取得の fileId を 500ms スロットルで `GET` し、
 *   dataURL 化して `addFiles`（`data:` URI 必須）。
 * - WS（durable）には**画像バイナリを流さない**。要素（fileId+status）のみ Phase 2 が同期する。
 */
export class BoardFiles {
  private readonly api: ExcalidrawImperativeAPI;
  private readonly serverUrl: string;
  private readonly boardId: string;

  private readonly uploading = new Set<string>();
  private readonly uploaded = new Set<string>();
  private readonly fetching = new Set<string>();
  private readonly fetched = new Set<string>();
  private loadTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;

  constructor(opts: BoardFilesOptions) {
    this.api = opts.api;
    this.serverUrl = opts.serverUrl;
    this.boardId = opts.boardId;
  }

  /** `onChange` から呼ぶ。未送信画像をアップロードし、未取得画像の取得をスケジュールする。 */
  handleSceneChange(): void {
    if (this.disposed) return;
    this.scanUploads();
    this.scheduleLoad();
  }

  dispose(): void {
    this.disposed = true;
    if (this.loadTimer !== null) clearTimeout(this.loadTimer);
  }

  // ---- アップロード ----

  private scanUploads(): void {
    const files = this.api.getFiles();
    for (const el of this.api.getSceneElements()) {
      if (el.type !== "image" || el.status !== "pending" || !el.fileId)
        continue;
      const fileId = el.fileId;
      const file = files[fileId];
      if (!file) continue; // バイナリ未保持（受信側の未取得 pending 等）はスキップ
      if (this.uploading.has(fileId) || this.uploaded.has(fileId)) continue;
      void this.upload(fileId, file.dataURL);
    }
  }

  private async upload(fileId: string, dataURL: string): Promise<void> {
    this.uploading.add(fileId);
    try {
      const blob = await (await fetch(dataURL)).blob();
      const form = new FormData();
      form.append("fileId", fileId);
      form.append("file", blob, fileId);
      const res = await fetch(
        `${this.serverUrl}/api/boards/${this.boardId}/assets`,
        { method: "POST", credentials: "include", body: form },
      );
      if (res.ok) {
        this.uploaded.add(fileId);
        await this.markStatus(fileId, "saved");
      } else if (PERMANENT_FAILURE.has(res.status)) {
        // 恒久失敗（容量/形式/削除中）: error 表示にして再試行しない。
        this.uploaded.add(fileId);
        await this.markStatus(fileId, "error");
      }
      // それ以外（ネットワーク/5xx）は uploaded に入れず次回 onChange で再試行。
    } catch (error) {
      console.error("[board-files] upload failed", error);
    } finally {
      this.uploading.delete(fileId);
    }
  }

  /** 画像要素の status を更新（version を bump して Phase 2 同期に乗せる・undo に積まない）。 */
  private async markStatus(
    fileId: string,
    status: "saved" | "error",
  ): Promise<void> {
    if (this.disposed) return;
    const { newElementWith, CaptureUpdateAction } = await import(
      "@excalidraw/excalidraw"
    );
    let changed = false;
    const next = this.api.getSceneElementsIncludingDeleted().map((el) => {
      if (el.type === "image" && el.fileId === fileId && el.status !== status) {
        changed = true;
        return newElementWith(el, { status });
      }
      return el;
    });
    if (changed) {
      this.api.updateScene({
        elements: next,
        captureUpdate: CaptureUpdateAction.NEVER,
      });
    }
  }

  // ---- 受信 ----

  private scheduleLoad(): void {
    if (this.loadTimer !== null) return;
    this.loadTimer = setTimeout(() => {
      this.loadTimer = null;
      void this.loadImageFiles();
    }, LOAD_THROTTLE_MS);
  }

  private async loadImageFiles(): Promise<void> {
    if (this.disposed) return;
    const files = this.api.getFiles();
    const wanted = new Set<string>();
    for (const el of this.api.getSceneElements()) {
      if (el.type !== "image" || el.status !== "saved" || !el.fileId) continue;
      const fileId = el.fileId;
      if (
        files[fileId] ||
        this.fetching.has(fileId) ||
        this.fetched.has(fileId)
      ) {
        continue;
      }
      wanted.add(fileId);
    }
    if (wanted.size === 0) return;

    const added: BinaryFileData[] = [];
    await Promise.all(
      [...wanted].map(async (fileId) => {
        this.fetching.add(fileId);
        try {
          const res = await fetch(
            `${this.serverUrl}/api/boards/${this.boardId}/assets/${fileId}`,
            { credentials: "include" },
          );
          if (!res.ok) return; // 404（まだ ready でない）等は fetched に入れず次回再試行。
          const blob = await res.blob();
          const dataURL = await blobToDataURL(blob);
          added.push({
            mimeType: blob.type as BinaryFileData["mimeType"],
            id: fileId as FileId,
            dataURL: dataURL as DataURL,
            created: Date.now(),
          });
          this.fetched.add(fileId);
        } catch (error) {
          console.error("[board-files] fetch failed", error);
        } finally {
          this.fetching.delete(fileId);
        }
      }),
    );
    if (added.length > 0 && !this.disposed) {
      this.api.addFiles(added);
    }
  }
}
