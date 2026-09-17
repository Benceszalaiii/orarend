import type { Metadata } from "next";
import { requireAdmin } from "@/lib/announcement-store";
import { loadClassList } from "@/lib/known-class";
import prisma from "@/lib/prisma";
import { loadTeacherDirectory } from "@/lib/teacher-directory";
import { AccessDenied } from "./_components/access-denied";
import { type AdminUserRow, UserManager } from "./user-manager";

export const metadata: Metadata = {
  title: "Felhasználók – Órarend",
  robots: { index: false, follow: false },
};

//! MINDIG FRISS: a munkamenettől függ, mit lát a látogató.
export const dynamic = "force-dynamic";

const DAY_MS = 24 * 60 * 60 * 1000;

export default async function AdminUsersPage() {
  const actor = await requireAdmin();
  if (!actor) return <AccessDenied next="/admin" />;

  const [users, teachers, classes] = await Promise.all([
    prisma.user.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        username: true,
        class: true,
        isTeacher: true,
        teacherName: true,
        isAdmin: true,
        role: true,
        banned: true,
        identityLocked: true,
        createdAt: true,
        lastActiveAt: true,
        accounts: { select: { providerId: true } },
      },
    }),
    loadTeacherDirectory(),
    loadClassList(),
  ]);

  const now = Date.now();
  const rows: AdminUserRow[] = users.map((u) => ({
    id: u.id,
    name: u.name,
    //* Az AD-fiókok szintetikus címe (`@jedlik-ad.invalid`) semmit nem mond —
    //* ott a felhasználónév az azonosító.
    email: u.email.endsWith(".invalid") ? null : u.email,
    image: u.image,
    username: u.username,
    class: u.class,
    isTeacher: u.isTeacher,
    teacherName: u.teacherName,
    isAdmin: u.isAdmin,
    roleAdmin: u.role === "admin",
    banned: u.banned === true,
    identityLocked: u.identityLocked,
    providers: [...new Set(u.accounts.map((a) => a.providerId))],
    createdAt: u.createdAt.toISOString(),
    lastActiveAt: u.lastActiveAt?.toISOString() ?? null,
  }));

  const activeSince = (days: number) =>
    rows.filter(
      (r) =>
        r.lastActiveAt &&
        now - new Date(r.lastActiveAt).getTime() < days * DAY_MS,
    ).length;

  const summary = {
    total: rows.length,
    teachers: rows.filter((r) => r.isTeacher).length,
    students: rows.filter((r) => !r.isTeacher && r.class).length,
    admins: rows.filter((r) => r.isAdmin).length,
    active7: activeSince(7),
    new30: rows.filter(
      (r) => now - new Date(r.createdAt).getTime() < 30 * DAY_MS,
    ).length,
  };

  return (
    <main className="mt-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Tile label="Összes fiók" value={summary.total} />
        <Tile label="Tanár" value={summary.teachers} />
        <Tile label="Diák osztállyal" value={summary.students} />
        <Tile label="Üzemeltető" value={summary.admins} />
        <Tile label="Aktív (7 nap)" value={summary.active7} />
        <Tile label="Új (30 nap)" value={summary.new30} />
      </div>

      <UserManager
        rows={rows}
        currentUserId={actor.id}
        canGrantRoleAdmin={actor.role === "admin"}
        teachers={
          teachers
            ?.map((t) => ({ short: t.short, name: t.name }))
            .sort((a, b) => a.name.localeCompare(b.name, "hu")) ?? null
        }
        classes={classes}
      />
    </main>
  );
}

function Tile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold tracking-tight text-foreground tabular-nums">
        {value.toLocaleString("hu-HU")}
      </p>
    </div>
  );
}
