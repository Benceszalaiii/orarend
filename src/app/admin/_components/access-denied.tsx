import Link from "next/link";

export function AccessDenied({ next }: { next: string }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-10">
      <h1 className="text-2xl font-bold tracking-tight text-foreground">
        Nincs hozzáférésed
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        Az üzemeltetői pultot csak üzemeltetői joggal rendelkező fiók nyithatja
        meg. Ha van ilyen fiókod, lépj be vele.
      </p>
      <Link
        href={`/belepes?tovabb=${encodeURIComponent(next)}`}
        className="mt-4 text-sm font-medium text-primary underline-offset-4 hover:underline"
      >
        Belépés
      </Link>
    </main>
  );
}
