import type { Metadata } from "next";
import { KivetitesRoom } from "../kivetites-client";

type Props = {
  params: Promise<{ terem: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

function roomOf(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const room = roomOf((await params).terem);
  return {
    title: `Kivetítés · ${room}`,
    description: `A ${room} terem tanári képernyője, ugyanarról a wifiről.`,
    //* Egy terem helyi IP-címe senki keresőjébe nem tartozik.
    robots: { index: false, follow: false },
  };
}

export default async function Page({ params, searchParams }: Props) {
  //* `?tanar=` — az órarendből érkezve: a diák saját (tartalék) címét ehhez a
  //* tanárhoz keressük. Közvetlen (QR-kódos) megnyitásnál nincs, és nem is kell.
  const tanar = (await searchParams).tanar;
  return (
    <KivetitesRoom
      room={roomOf((await params).terem)}
      teacher={typeof tanar === "string" ? tanar : null}
    />
  );
}
