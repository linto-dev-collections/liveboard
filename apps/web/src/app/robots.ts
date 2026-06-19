import type { MetadataRoute } from "next";

const BASE = "https://liveboard.linto-dev.workers.dev";

// クローラに対する明示的な指示。
// - /share/ と /embed/ は disallow に含めない: Slack / X / Discord 等の link
//   preview スクレイパは robots.txt を尊重するため、disallow すると OG カードが
//   生成できなくなる。SERP からの除外は各ページの `robots: noindex` で行う。
// - /dashboard/ /invitation/ /embed-auth/ /promo/ は SNS プレビュー用途すら無いため
//   クロール自体を抑制してインフラ負荷を減らす。
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/dashboard/", "/invitation/", "/embed-auth/", "/promo/"],
      },
    ],
    sitemap: `${BASE}/sitemap.xml`,
    host: BASE,
  };
}
