import type { MetadataRoute } from "next";

const BASE = "https://liveboard.linto-dev.workers.dev";

// 公開マーケティング系の静的ルートのみを列挙する。
// /dashboard/* /invitation/* /goodbye は動的かつ noindex のため含めない。
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    {
      url: BASE,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 1.0,
    },
  ];
}
