export default function Hero() {
  return (
    <section className="flex relative flex-col h-dvh bg-linear-to-b from-[#F3EBDD] via-90% via-[#F3EBDD] to-primary items-center justify-center gap-4 px-4 py-8 text-center">
      <h1 className="text-2xl md:text-7xl/15 font-bold text-accent">
        Amire eddig vágytatok.{" "}
        <span className="font-script text-9xl/18 text-shadow-xs text-primary">
          {" "}
          <br />
          Már valóság
        </span>
      </h1>
   </section>
  );
}
