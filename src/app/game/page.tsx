"use client";

import { useRouter } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";

import { GrimoireSetup } from "@/components/GrimoireSetup";
import { getGameSnapshot, subscribeGame } from "@/lib/gameStorage";

const getServerSnapshot = () => null;

function subscribeNever() {
  return () => {};
}

// A static export's prerendered HTML never has an active game (no
// localStorage at build time), so the very first client render — before
// hydration resolves — always sees the game snapshot as null too,
// indistinguishable from "genuinely no active game". This resolves to
// true only once the client has moved past that hydration-matching
// render, so a null game can then be trusted enough to redirect.
function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false,
  );
}

export default function GamePage() {
  const router = useRouter();
  const game = useSyncExternalStore(
    subscribeGame,
    getGameSnapshot,
    getServerSnapshot,
  );
  const hydrated = useHydrated();

  useEffect(() => {
    if (hydrated && !game) router.replace("/");
  }, [hydrated, game, router]);

  if (!hydrated || !game) return null;

  return <GrimoireSetup game={game} />;
}
