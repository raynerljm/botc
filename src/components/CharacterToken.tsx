import Image from "next/image";

import type { Character } from "@/lib/characters";

import styles from "./CharacterToken.module.css";

// Token art is decorative next to the character's name, so the image is
// unnamed for assistive tech; characters without vendored art fall back to
// an initials disc.
export function CharacterToken({ character }: { character: Character }) {
  if (!character.image) {
    const initials = character.name
      .split(" ")
      .map((word) => word[0])
      .slice(0, 2)
      .join("");
    return (
      <span className={styles.fallback} data-team={character.team} aria-hidden>
        {initials}
      </span>
    );
  }
  return (
    <Image
      src={character.image}
      alt=""
      width={48}
      height={48}
      className={styles.token}
      // Static export has no optimization server (also applied globally in
      // next.config.ts, which tests don't load).
      unoptimized
    />
  );
}
