import { mock } from "bun:test";

//* A `server-only` a `react-server` feltétel nélkül importáláskor DOB — a
//* tesztfuttató nem a Next szerverkomponens-környezete, ezért itt üresre
//* cseréljük. A modul csak jelölő, viselkedése nincs.
mock.module("server-only", () => ({}));
