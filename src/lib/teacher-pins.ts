//! ═══════════════════════════════════════════════════════════════════════════
//! KÉZI KIVÉTELEK — E-MAIL-CÍM → TANÁR
//! ═══════════════════════════════════════════════════════════════════════════
//! A névalapú illesztés (`teacher-name.ts`) szándékosan NEM dönt, ha egy név
//! több tanárra illik. A tantestületben van ilyen: két `Horváth Norbert`, csak
//! születési dátumban különböznek. Nekik a Google-név SOHA nem adhat tanári
//! jogot — itt, e-mail-cím szerint rögzítjük, ki melyik.
//!
//! A RÖGZÍTÉS KÉT HATÁSA:
//!   1. A rögzített cím a megadott tanár lesz, a Google-névtől függetlenül.
//!   2. A rögzített tanár KIESIK a többi fiók névalapú illesztéséből. Ha két
//!      azonos nevű tanárból az egyiket rögzítjük, a másik így egyértelművé
//!      válik: bármely MÁS `@jedlik.eu` fiók ezzel a névvel őt kapja.
//!
//! AZ ÉRTÉK A JEDLIKINFO LISTA NEVE, BETŰRE PONTOSAN (a zárójeles dátummal,
//! ahogy a `timetable/teachers` adja). Ha a listában nincs pontosan ilyen név,
//! a rögzített fiók NEM kap tanári jogot — egy elírás nem adhat rossz jogot.
//! A kulcs kisbetűs e-mail-cím.
//! ═══════════════════════════════════════════════════════════════════════════

export const TEACHER_EMAIL_PINS: ReadonlyMap<string, string> = new Map([
  //* A két Horváth Norbert közül a `HN` jelű. A `HF` jelű (1979.04.09.) címe
  //* nem ismert — őt a fenti 2. pont oldja fel.
  ["flash@jedlik.eu", "Horváth Norbert (1979.05.16.)"],
]);
