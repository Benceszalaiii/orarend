"use client";

import { Lock } from "lucide-react";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { type LoginState, login } from "./actions";

const INITIAL: LoginState = {};

export function LoginForm() {
  const [state, formAction, pending] = useActionState(login, INITIAL);

  return (
    <form
      action={formAction}
      className="mx-auto flex w-full max-w-sm flex-col gap-4 rounded-lg border border-border bg-card p-6"
    >
      <div className="flex items-center gap-2.5">
        <Lock className="size-4 text-muted-foreground" aria-hidden />
        <h1 className="text-base font-semibold text-foreground">
          Használati statisztika
        </h1>
      </div>

      <p className="text-sm leading-relaxed text-muted-foreground">
        Ez az oldal az üzemeltetőé. A számok osztályszintűek — nem tartoznak
        egyetlen diákhoz sem.
      </p>

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="stats-password"
          className="text-xs font-medium text-muted-foreground"
        >
          Jelszó
        </label>
        <input
          id="stats-password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
        />
      </div>

      {/*//! A HIBA A GOMB FÖLÖTT, ÉS FELOLVASVA IS. Egy jelszómezőnél a néma
          //! visszapattanás a leggyakoribb zsákutca — a `role="alert"` miatt a
          //! képernyőolvasó is megkapja, nem csak a látó szem. */}
      {state.error ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Ellenőrzés…" : "Belépés"}
      </Button>
    </form>
  );
}
