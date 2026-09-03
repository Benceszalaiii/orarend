interface Feature {
    title: string;
    description: string;
}

const features: Feature[] = [
    {
        title: "Progresszív webalkalmazás",
        description:
            "Az órarendet telepítheted a kezdőképernyődre, amit offline is elérsz."
    },
    {
        title: "Csoportbontás",
        description: "Néha belekeveredsz a csoportbontásokba? Az órarenden te állítod be, melyik csoportba tartozol."
    },
    {
        title: "Progresszív nézet",
        description: "Mai napod. Tisztán lebontva. Csak azt látod, ami éppen fontos."
    },
    {
        title: "Duális képzés",
        description: "Duális képzésben vagy? Beállíthatod melyik napokon tanulsz, ráadásul a heti terhelésedet is látod."
    },
    {
        title: "Frappáns felület",
        description: "\"Egyszerűen működik\", telefonon, laptopon."
    }
]

export default function Features(){
    return (
        <section className="flex flex-col gap-4 bg-primary px-4 py-8 text-center">
            
            {features.map((feature, index) => (
                <div key={index}>
                    <h3 className="text-lg md:text-xl font-jakarta-sans text-primary-foreground">
                        {feature.title}
                    </h3>
                    <p className="text-sm md:text-base text-primary-foreground">
                        {feature.description}
                    </p>
                </div>
            ))}
            </section>
            )
}