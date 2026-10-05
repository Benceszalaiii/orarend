"use client";

import { ClubError } from "./_components/club-states";

export default function ClubsError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return <ClubError subject="Szakkörök" error={error} retry={retry} />;
}
