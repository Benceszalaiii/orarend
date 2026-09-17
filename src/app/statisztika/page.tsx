import { redirect } from "next/navigation";

//! A STATISZTIKA ÁTKÖLTÖZÖTT az üzemeltetői pultba (`/admin/statisztika`), és
//! a `STATS_KEY` jelszó helyett az `isAdmin` jog védi. A régi könyvjelzők ne
//! vesszenek el. Gépi kiolvasásra a `GET /api/hasznalat` a kulccsal marad.
export default function StatisztikaPage() {
  redirect("/admin/statisztika");
}
