"use client";

import type { ExcalidrawElementSkeleton } from "@excalidraw/excalidraw/data/transform";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { Button } from "@liveboard/ui/components/ui/button";
import { StickyNote } from "lucide-react";

const STICKY_SIZE = 200;
const STICKY_BG = "#ffec99";
const STICKY_STROKE = "#f08c00";

/**
 * 付箋（塗りつぶし矩形＋バインドテキスト）をビューポート中心に 1 ローカル操作で追加する。
 * skeleton API（`convertToExcalidrawElements` + `label`）で containerId/boundElements/寸法整合を
 * 純正ロジックに委ねる。`IMMEDIATELY` で undo 可とし、onChange 経由で Phase 2 の outbox が
 * 矩形＋テキストを同一バッチ同期する（N3）。
 */
async function addStickyNote(api: ExcalidrawImperativeAPI): Promise<void> {
  const { convertToExcalidrawElements, CaptureUpdateAction } = await import(
    "@excalidraw/excalidraw"
  );
  const { width, height, scrollX, scrollY, zoom } = api.getAppState();
  const centerX = width / 2 / zoom.value - scrollX;
  const centerY = height / 2 / zoom.value - scrollY;

  const skeleton: ExcalidrawElementSkeleton[] = [
    {
      type: "rectangle",
      x: centerX - STICKY_SIZE / 2,
      y: centerY - STICKY_SIZE / 2,
      width: STICKY_SIZE,
      height: STICKY_SIZE,
      backgroundColor: STICKY_BG,
      strokeColor: STICKY_STROKE,
      fillStyle: "solid",
      label: {
        text: "",
        fontSize: 20,
        textAlign: "center",
        verticalAlign: "middle",
      },
    },
  ];

  const created = convertToExcalidrawElements(skeleton);
  const container = created.find((el) => el.type === "rectangle");
  api.updateScene({
    elements: [...api.getSceneElementsIncludingDeleted(), ...created],
    appState: container
      ? { selectedElementIds: { [container.id]: true } }
      : undefined,
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
}

/**
 * Excalidraw 純正ツールバーを補う編集ボタン群（`renderTopRightUI` に差し込む）。
 * viewer には描画しない（編集 UI の二重防御。強制力は DO 側 M6）。
 */
export function ToolbarExtras({ api }: { api: ExcalidrawImperativeAPI }) {
  return (
    <Button
      type="button"
      size="sm"
      variant="secondary"
      title="付箋を追加"
      onClick={() => {
        addStickyNote(api).catch((error) => {
          console.error("[board-canvas] failed to add sticky note", error);
        });
      }}
    >
      <StickyNote />
      付箋
    </Button>
  );
}
