import { PrismaPg } from "@prisma/adapter-pg";
import { clubSlug } from "../../src/lib/clubs";
import { PrismaClient } from "../generated/client";
import { SEED_CLUBS } from "./clubs";
import {
  checkAgainstJedlikinfo,
  checkShape,
  type SeedProblem,
} from "./validate";

//! ═══════════════════════════════════════════════════════════════════════════
//! A KEZDŐ SZAKKÖRLISTA BETÖLTÉSE
//! ═══════════════════════════════════════════════════════════════════════════
//!   bun run db:seed:clubs            ellenőriz, aztán betölti az újakat
//!   bun run db:seed:clubs --check    csak ellenőriz, adatbázishoz nem nyúl
//!   bun run db:seed:clubs --force    a MÁR MEGLÉVŐ szakköröket is felülírja
//!   bun run db:seed:clubs --offline  a Jedlikinfo-ellenőrzést kihagyja
//!
//! ALAPBÓL NEM ÍR FELÜL SEMMIT. Egy szakkör, ami már az adatbázisban van,
//! lehet, hogy azóta a tanára szerkesztette (leírás, időpont, új vezető) —
//! egy újrafuttatás ezt csendben visszaállítaná a kezdő listára. A `--force`
//! ezt kimondottan kéri, és a vezetőket meg az időpontokat CSERÉLI (a tagság
//! megmarad).
//!
//! A `DB_DIRECT_URL`-t használja, ha van (lásd `prisma.config.ts`: a pooler
//! mögött a hosszabb tranzakciók is gond nélkül mennek, de nincs okunk
//! kockáztatni). A Bun a `.env.local`-t magától betölti.
//! ═══════════════════════════════════════════════════════════════════════════

const JEDLIKINFO = "https://jedlikinfo.jedlik.eu/api/api/timetable";

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");
const force = args.has("--force");
const offline = args.has("--offline");

async function shorts(path: string): Promise<Set<string>> {
  const res = await fetch(`${JEDLIKINFO}/${path}`, {
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Jedlikinfo ${path}: HTTP ${res.status}`);
  const list = (await res.json()) as { short?: unknown }[];
  return new Set(
    list.map((x) => x.short).filter((s): s is string => typeof s === "string"),
  );
}

function fail(title: string, problems: SeedProblem[]): never {
  console.error(`\n✗ ${title}`);
  for (const p of problems) console.error(`  • ${p.club}: ${p.problem}`);
  process.exit(1);
}

async function main() {
  const shape = checkShape(SEED_CLUBS);
  if (shape.length > 0) fail("A kezdő lista alakja hibás", shape);
  console.log(`✓ Alak: ${SEED_CLUBS.length} szakkör`);

  if (!offline) {
    const [teachers, rooms, classes] = await Promise.all([
      shorts("teachers"),
      shorts("classrooms"),
      shorts("classes"),
    ]);
    const real = checkAgainstJedlikinfo(SEED_CLUBS, {
      teachers,
      rooms,
      classes,
    });
    if (real.length > 0) fail("Eltérés a Jedlikinfótól", real);
    console.log("✓ Minden tanárjel, terem és osztály szerepel a Jedlikinfóban");
  }

  if (checkOnly) return;

  const url = process.env.DB_DIRECT_URL ?? process.env.DB_URL;
  if (!url) {
    console.error("✗ Nincs DB_URL / DB_DIRECT_URL — lásd .env.example");
    process.exit(1);
  }
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: url }),
  });

  let created = 0;
  let replaced = 0;
  let skipped = 0;
  try {
    for (const club of SEED_CLUBS) {
      const slug = clubSlug(club.name);
      const organizers = club.organizers.map((teacher, i) => ({
        teacher,
        lead: i === 0,
      }));
      const slots = club.slots.map((s) => ({
        weekday: s.weekday,
        startMinute: s.startMinute,
        endMinute: s.endMinute,
        room: s.room,
        teachers: s.teachers,
        source: s.source,
      }));
      const fields = {
        name: club.name,
        description: club.description,
        kind: club.kind,
        grades: club.grades,
        classes: club.classes,
        audienceNote: club.audienceNote,
      };

      const existing = await prisma.club.findUnique({
        where: { slug },
        select: { id: true },
      });
      if (existing && !force) {
        skipped++;
        continue;
      }
      if (existing) {
        await prisma.$transaction([
          prisma.clubOrganizer.deleteMany({ where: { clubId: existing.id } }),
          prisma.clubSlot.deleteMany({ where: { clubId: existing.id } }),
          prisma.club.update({
            where: { id: existing.id },
            data: {
              ...fields,
              confirmedAt: new Date(),
              organizers: { create: organizers },
              slots: { create: slots },
            },
          }),
        ]);
        replaced++;
      } else {
        await prisma.club.create({
          data: {
            slug,
            ...fields,
            organizers: { create: organizers },
            slots: { create: slots },
          },
        });
        created++;
      }
    }
  } finally {
    await prisma.$disconnect();
  }

  console.log(
    `✓ Kész: ${created} új, ${replaced} felülírva, ${skipped} már megvolt (kihagyva)`,
  );
}

await main();
