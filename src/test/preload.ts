import { mock } from "bun:test";

//* Az app budapesti időben gondolkodik (a kliens helyi ideje is az). A gép
//* időzónájától függő teszt másik gépen / CI-ban másképp futna — ezért rögzítjük.
process.env.TZ = "Europe/Budapest";

//* A `server-only` a `react-server` feltétel nélkül importáláskor DOB — a
//* tesztfuttató nem a Next szerverkomponens-környezete, ezért itt üresre
//* cseréljük. A modul csak jelölő, viselkedése nincs.
mock.module("server-only", () => ({}));
