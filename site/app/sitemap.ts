import type { MetadataRoute } from "next";

import { SITE } from "@/lib/conteudo";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: SITE.url, lastModified: SITE.atualizadoEm, changeFrequency: "monthly", priority: 1 },
  ];
}
