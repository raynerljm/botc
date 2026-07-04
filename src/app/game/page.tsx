"use client";

import { useRouter } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";

import { GrimoireSetup } from "@/components/GrimoireSetup";
import { getGameSnapshot, subscribeGame } from "@/lib/gameStorage";

const getServerSnapshot = () => null;

export default function GamePage() {
  const router = useRouter();
  const game = useSyncExternalStore(
    subscribeGame,
    getGameSnapshot,
    getServerSnapshot,
  );

  useEffect(() => {
    if (!game) router.replace("/");
  }, [game, router]);

  if (!game) return null;

  return <GrimoireSetup game={game} />;
}
