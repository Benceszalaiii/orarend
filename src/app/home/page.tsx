"use server";

import { SiteNav } from "@/components/site-nav";
import Hero from "./_components/hero";
import Latest from "./_components/latest";
import Features from "./_components/features";

export default async function Page() {
  return (
    <main>
        <SiteNav className="fixed top-4 right-4 z-50" />
      <Hero />
      <Latest/>
      <Features/>
    </main>
  );
}
