//! A KARAKTERKÉSZLETET KI KELL MONDANI. A `Response.json()` Node-on (és így a
//! Vercelen) csak `application/json`-t ír, `charset` nélkül. A JSON ugyan
//! mindig UTF-8, de nem minden kliens tudja ezt: aki a fejlécből dönt (több
//! HTTP-kliens, némelyik AI-asszisztens lekérője), Latin-1-ként olvassa, és a
//! „Ágoston Anett"-ből „Ãgoston Anett" lesz. Ezt a kérdező nem tudja
//! visszacsinálni, ezért itt mondjuk meg helyette.
export function jsonUtf8(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(body), { ...init, headers });
}
