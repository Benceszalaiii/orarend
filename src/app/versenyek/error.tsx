"use client";

import { ClubError } from "../szakkorok/_components/club-states";

export default function ContestsError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return <ClubError subject="Versenyek" error={error} retry={retry} />;
}
