import { HomeRedirect } from "./home-redirect";

//* A nyitóoldal az utoljára használt nézetre visz tovább (alapértelmezésben a
//* `/orarend`-re); a döntés a böngészőben tárolt emlék alapján, kliensoldalon
//* születik meg — lásd `lib/last-view.ts`.
export default function Home() {
  return <HomeRedirect />;
}
