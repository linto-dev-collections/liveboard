import {
  AssetTooLargeError,
  AssetUnsupportedMediaTypeError,
} from "../errors/asset.error";
import { ValidationError } from "../errors/domain.error";

/**
 * アセット検証（M9・§5.8/§5.10）の純関数群。DB/R2 に触れない（domain 層）。
 * クライアント申告の MIME は信用せず、**マジックバイトから実フォーマットを判定**して
 * 許可リスト・サイズ・寸法を強制する（拡張子/MIME 詐称対策）。
 */

/** 画像 1 枚の最大バイト数（§5.10・dataURL 化で約 33% 膨張する点に留意）。 */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

/** ボードあたりの画像合計バイト上限（§5.10・N4）。 */
export const MAX_BOARD_ASSET_BYTES = 200 * 1024 * 1024;

/** 画像の寸法上限（ピクセル・デコード爆発の抑止）。 */
export const MAX_IMAGE_DIMENSION = 8192;

/**
 * SVG の取り扱い。Cloudflare Workers は DOM を持たず、Workers 互換の SVG サニタイザを
 * 導入していないため **MVP では SVG を無効化**（415）。状態機械（'sanitizing'）と enum は
 * 将来のサニタイザ導入のために温存する。設定で切替可能にしておく。
 */
export const ALLOW_SVG = false;

/** ラスタ既定の許可フォーマット → 正規 MIME。 */
const RASTER_MIME: Record<ImageFormat, AssetMime> = {
  png: "image/png",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
};

export type ImageFormat = "png" | "jpeg" | "gif" | "webp" | "svg";

export type AssetMime =
  | "image/png"
  | "image/jpeg"
  | "image/gif"
  | "image/webp"
  | "image/svg+xml";

export type ValidatedUpload = {
  /** マジックバイトから判定した正規 MIME（asset.mime に保存）。 */
  mime: AssetMime;
  width: number | null;
  height: number | null;
};

function u16be(b: Uint8Array, o: number): number {
  return ((b[o] ?? 0) << 8) | (b[o + 1] ?? 0);
}
function u16le(b: Uint8Array, o: number): number {
  return (b[o] ?? 0) | ((b[o + 1] ?? 0) << 8);
}
function u24le(b: Uint8Array, o: number): number {
  return (b[o] ?? 0) | ((b[o + 1] ?? 0) << 8) | ((b[o + 2] ?? 0) << 16);
}
function u32be(b: Uint8Array, o: number): number {
  return (
    ((b[o] ?? 0) * 0x1000000 +
      ((b[o + 1] ?? 0) << 16) +
      ((b[o + 2] ?? 0) << 8) +
      (b[o + 3] ?? 0)) >>>
    0
  );
}

function matches(b: Uint8Array, offset: number, sig: number[]): boolean {
  for (let i = 0; i < sig.length; i++) {
    if (b[offset + i] !== sig[i]) return false;
  }
  return true;
}

/** マジックバイトから画像フォーマットを判定（不明なら null）。 */
export function detectImageFormat(bytes: Uint8Array): ImageFormat | null {
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (matches(bytes, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "png";
  }
  // JPEG: FF D8 FF
  if (matches(bytes, 0, [0xff, 0xd8, 0xff])) return "jpeg";
  // GIF: "GIF87a" / "GIF89a"
  if (matches(bytes, 0, [0x47, 0x49, 0x46, 0x38])) return "gif";
  // WebP: "RIFF"...."WEBP"
  if (
    matches(bytes, 0, [0x52, 0x49, 0x46, 0x46]) &&
    matches(bytes, 8, [0x57, 0x45, 0x42, 0x50])
  ) {
    return "webp";
  }
  // SVG: テキスト先頭に "<?xml" か "<svg"（BOM/空白を寛容にスキップ）
  if (looksLikeSvg(bytes)) return "svg";
  return null;
}

function looksLikeSvg(bytes: Uint8Array): boolean {
  let i = 0;
  // UTF-8 BOM
  if (matches(bytes, 0, [0xef, 0xbb, 0xbf])) i = 3;
  // 先頭の空白を読み飛ばす
  while (i < bytes.length && i < 256) {
    const c = bytes[i];
    if (c === 0x20 || c === 0x09 || c === 0x0a || c === 0x0d) {
      i++;
      continue;
    }
    break;
  }
  const head = new TextDecoder()
    .decode(bytes.subarray(i, Math.min(bytes.length, i + 256)))
    .toLowerCase();
  return head.startsWith("<?xml") || head.startsWith("<svg");
}

/** フォーマット別に寸法を読む（読めなければ null）。 */
export function readImageDimensions(
  bytes: Uint8Array,
  format: ImageFormat,
): { width: number; height: number } | null {
  try {
    switch (format) {
      case "png":
        // IHDR: width@16, height@20（uint32 BE）
        return { width: u32be(bytes, 16), height: u32be(bytes, 20) };
      case "gif":
        // width@6, height@8（uint16 LE）
        return { width: u16le(bytes, 6), height: u16le(bytes, 8) };
      case "jpeg":
        return readJpegDimensions(bytes);
      case "webp":
        return readWebpDimensions(bytes);
      default:
        return null;
    }
  } catch {
    return null;
  }
}

function readJpegDimensions(
  b: Uint8Array,
): { width: number; height: number } | null {
  let off = 2; // SOI(FFD8) の後
  const len = b.length;
  while (off + 9 < len) {
    if (b[off] !== 0xff) {
      off++;
      continue;
    }
    let marker = b[off + 1];
    // フィルバイト（連続 FF）をスキップ
    while (marker === 0xff && off + 1 < len) {
      off++;
      marker = b[off + 1];
    }
    // SOF0..SOF15（DHT=C4 / JPG=C8 / DAC=CC を除く）に寸法
    if (
      marker !== undefined &&
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 &&
      marker !== 0xc8 &&
      marker !== 0xcc
    ) {
      return { height: u16be(b, off + 5), width: u16be(b, off + 7) };
    }
    // セグメント長で次へ
    const segLen = u16be(b, off + 2);
    if (segLen <= 0) return null;
    off += 2 + segLen;
  }
  return null;
}

function readWebpDimensions(
  b: Uint8Array,
): { width: number; height: number } | null {
  // 12..16 = フォーマットチャンク識別子
  if (matches(b, 12, [0x56, 0x50, 0x38, 0x20])) {
    // "VP8 "（lossy）: 26/28 に 14bit 寸法
    return { width: u16le(b, 26) & 0x3fff, height: u16le(b, 28) & 0x3fff };
  }
  if (matches(b, 12, [0x56, 0x50, 0x38, 0x4c])) {
    // "VP8L"（lossless）: 21.. のビット列
    const b0 = b[21] ?? 0;
    const b1 = b[22] ?? 0;
    const b2 = b[23] ?? 0;
    const b3 = b[24] ?? 0;
    const width = 1 + (((b1 & 0x3f) << 8) | b0);
    const height = 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6));
    return { width, height };
  }
  if (matches(b, 12, [0x56, 0x50, 0x38, 0x58])) {
    // "VP8X"（extended）: 24/27 に 24bit (-1) 寸法
    return { width: 1 + u24le(b, 24), height: 1 + u24le(b, 27) };
  }
  return null;
}

/**
 * アップロード検証。**bytes 必須**（マジックバイト＋寸法を内部で判定）。
 * - サイズ ≤ MAX_IMAGE_BYTES（超過は 413）
 * - フォーマットは許可リスト内（SVG は ALLOW_SVG=false で 415）
 * - 寸法 ≤ MAX_IMAGE_DIMENSION（超過は 400・読めない場合は null 容認）
 * @returns 正規 MIME と寸法
 */
export function validateUpload(input: {
  size: number;
  bytes: Uint8Array;
}): ValidatedUpload {
  if (input.size <= 0) {
    throw new ValidationError("空のファイルはアップロードできません");
  }
  if (input.size > MAX_IMAGE_BYTES) {
    throw new AssetTooLargeError();
  }

  const format = detectImageFormat(input.bytes);
  if (format === null) {
    throw new AssetUnsupportedMediaTypeError();
  }
  if (format === "svg" && !ALLOW_SVG) {
    throw new AssetUnsupportedMediaTypeError(
      "SVG は現在サポートされていません",
    );
  }

  const dims = readImageDimensions(input.bytes, format);
  if (
    dims &&
    (dims.width > MAX_IMAGE_DIMENSION || dims.height > MAX_IMAGE_DIMENSION)
  ) {
    throw new ValidationError(
      `画像の寸法が上限（${MAX_IMAGE_DIMENSION}px）を超えています`,
    );
  }

  return {
    mime: RASTER_MIME[format],
    width: dims?.width ?? null,
    height: dims?.height ?? null,
  };
}
