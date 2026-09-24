import { mock } from "bun:test";
import { FakeRedis } from "./redis";

//* Az app budapesti időben gondolkodik (a kliens helyi ideje is az). A gép
//* időzónájától függő teszt másik gépen / CI-ban másképp futna — ezért rögzítjük.
process.env.TZ = "Europe/Budapest";

//* A `server-only` a `react-server` feltétel nélkül importáláskor DOB — a
//* tesztfuttató nem a Next szerverkomponens-környezete, ezért itt üresre
//* cseréljük. A modul csak jelölő, viselkedése nincs.
mock.module("server-only", () => ({}));

//* A Redis-es tárolók a memóriában élő hamis kliensen futnak (lásd `redis.ts`).
//* A környezeti változók csak azért kellenek, hogy a tárolók létrehozzák a
//* klienst — hálózatra semmi nem megy ki.
process.env.REDIS_KV_REST_API_URL = "https://redis.test";
process.env.REDIS_KV_REST_API_TOKEN = "test-token";
mock.module("@upstash/redis", () => ({ Redis: FakeRedis }));
