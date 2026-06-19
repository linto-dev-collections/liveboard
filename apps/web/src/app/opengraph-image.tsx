import { ImageResponse } from "next/og";

// Next.js metadata file convention.
// Satori が WOFF2 非対応のため Inter WOFF を build 時に取得して baked-in する。
// 取得元は @fontsource/inter@5.2.8 (SIL OFL 1.1) を jsDelivr 経由で fetch、
// npm version を exact pin して supply-chain integrity を確保する。
// runtime には外部 fetch を残さない (build 時に PNG を生成し
// Cloudflare Static Assets として配信される)。
export const runtime = "nodejs";
export const alt = "liveboard";
export const size = { width: 1200, height: 630 } as const;
export const contentType = "image/png";

// @fontsource/inter の Latin subset Bold (~31 KB)。
// Satori は TTF/OTF/WOFF をサポートし WOFF2 のみ非対応 (vercel/satori#3)。
// Variable font (InterVariable.ttf) は Satori で parse エラーになる
// 既知問題 (vercel/satori#162, #712) があるため static weight を使う。
const INTER_BOLD_URL =
  "https://cdn.jsdelivr.net/npm/@fontsource/inter@5.2.8/files/inter-latin-700-normal.woff";

// brand tokens (packages/ui/src/styles/globals.css の OKLCH を sRGB 近似)。
// Satori は CSS Color Module 4 の oklch() を直接サポートしないため hex で渡す。
const BRAND_ORANGE = "#DF6035"; // --primary 相当 (icon.svg の path fill)
const BRAND_BG = "#F5F1ED"; // off-white (--background 近似)
const BRAND_FG = "#1F1F1F"; // foreground 近似

export default async function Image() {
  // build 時に Node.js で fetch される。runtime (Cloudflare Workers) には
  // この fetch は残らない (静的 PNG が出力されるため)。
  const interBold = await fetch(INTER_BOLD_URL).then((res) => {
    if (!res.ok) {
      throw new Error(
        `OG: failed to fetch Inter Bold (${res.status} ${res.statusText})`,
      );
    }
    return res.arrayBuffer();
  });

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "48px",
        backgroundColor: BRAND_BG,
        // brand のピーチ系 surface トークン (oklch(0.95 0.024 32)) を
        // sRGB 近似した #F8E8DF を右上に大きく敷く。
        backgroundImage:
          "radial-gradient(120% 90% at 100% 0%, #F8E8DF 0%, #F5F1ED 60%)",
        fontFamily: "Inter",
        color: BRAND_FG,
      }}
    >
      <LogoMark />
      <span
        style={{
          fontSize: "180px",
          fontWeight: 700,
          letterSpacing: "-0.04em",
          lineHeight: 1,
        }}
      >
        liveboard
      </span>
    </div>,
    {
      ...size,
      fonts: [{ name: "Inter", data: interBold, style: "normal", weight: 700 }],
    },
  );
}

// Satori は SVG の <path> をサポートする。app/icon.svg と同一の path data。
// SVG <title> は Satori が可視テキストとして描画してしまうため使わない。
// 画像のアクセシビリティ名は metadata file convention の `alt` export が担う。
function LogoMark() {
  return (
    <svg
      width="200"
      height="200"
      viewBox="0 0 512 512"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      role="presentation"
    >
      <path
        d="M256 512C416 512 512 400 512 256C512 80 400 0 208 0C80 0 0 112 0 256C0 400 112 512 256 512Z"
        fill={BRAND_ORANGE}
      />
      <path
        d="M214.664 170.192V114.384L283.784 101.072L277.128 170.192H339.08L333.448 212.176H275.08L272.52 319.184C272.52 335.227 274.056 345.979 277.128 351.44C280.2 356.56 285.832 359.12 294.024 359.12C302.216 359.12 313.139 357.243 326.792 353.488L329.864 389.84C307.336 408.613 287.539 418 270.472 418C253.405 418 239.411 411.856 228.488 399.568C217.565 386.939 212.104 370.555 212.104 350.416L215.176 293.072L214.664 212.176H179.336L184.968 170.192H214.664Z"
        fill="#FFFFFF"
      />
    </svg>
  );
}
