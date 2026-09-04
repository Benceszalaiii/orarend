import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/orarend"],
    },
    sitemap: "https://jedlik.info/sitemap.xml",
  };
}