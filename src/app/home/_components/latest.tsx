interface NewsItem {
  title: string;
  description: string;
}
const news: NewsItem[] = [
  {
    title: "Offline elérés",
    description:
      "Kifogytál a mobilnetből, vagy nincs hálózat? Nem gond, az órarend offline is elérhető.",
  },
  {
    title: "Szinkronizálás",
    description:
      "Többet nem kell beállítanod az órarendet. Jelentkezz be a Jedlik AD fiókodba, és az órarend automatikusan szinkronizálódik a csoportbontásokkal.",
  },
  {
    title: "Értesítések",
    description: "Változott az órarended? Kapj értesítést, hogy ne maradj le. Beállíthatod, hogy kicsengetéskor jelezze a következő órádat."
  }
]

export default function Latest() {
  return (
    <section className="flex flex-col gap-4 bg-primary px-4 py-8 text-center">
        <h2 className="text-2xl md:text-4xl font-semibold font-jakarta-sans text-primary-foreground">
            Frissen a sütőből
        </h2>
{news.map((item, index) => (
          <div key={index}>
            <h3 className="text-lg md:text-xl font-jakarta-sans text-primary-foreground">
              {item.title}
            </h3>
            <p>
              {item.description}
            </p>
          </div>
        ))}
    </section>
  );
}