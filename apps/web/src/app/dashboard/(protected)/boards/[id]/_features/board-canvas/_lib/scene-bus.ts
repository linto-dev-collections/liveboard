/**
 * board-canvas の `onChange` を購読者（コメントピンの射影など）へ通知する最小バス。
 * React の ref を介さずに済むため、コメントオーバーレイを `dynamic(ssr:false)` で
 * 読み込んでも購読できる（forwardRef 不要）。emit は高頻度なので購読側で間引く。
 */
export class SceneChangeBus {
  private readonly listeners = new Set<() => void>();

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  emit(): void {
    for (const fn of this.listeners) fn();
  }
}
