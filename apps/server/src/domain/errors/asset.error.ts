import { DomainError } from "./domain.error";

/**
 * アップロードされたファイルがサイズ上限を超過（M9・§5.10）。
 * HTTP マッピング: 413 Payload Too Large（app.ts:onError の PAYLOAD_TOO_LARGE）。
 */
export class AssetTooLargeError extends DomainError {
  constructor(message = "ファイルサイズが上限を超えています") {
    super(message, "PAYLOAD_TOO_LARGE");
  }
}

/**
 * 許可されない MIME / マジックバイト不一致 / SVG 無効化（M9）。
 * HTTP マッピング: 415 Unsupported Media Type（app.ts:onError の UNSUPPORTED_MEDIA_TYPE）。
 */
export class AssetUnsupportedMediaTypeError extends DomainError {
  constructor(message = "サポートされていない画像形式です") {
    super(message, "UNSUPPORTED_MEDIA_TYPE");
  }
}

/**
 * 削除中（purging）ボードへのアップロード等、現在の状態と競合（H6 のレース窓）。
 * HTTP マッピング: 409 Conflict（app.ts:onError の CONFLICT）。
 */
export class AssetConflictError extends DomainError {
  constructor(message = "ボードが削除中のためアップロードできません") {
    super(message, "CONFLICT");
  }
}
