import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ScriptSheet } from "@/components/ScriptSheet";
import { ShareScriptButton } from "@/components/ShareScriptButton";
import { TeensyvilleBadge } from "@/components/TeensyvilleBadge";
import { isTeensyvilleScript } from "@/lib/scriptParser";
import { getScriptById, listScriptSummaries } from "@/lib/scripts";

import styles from "./page.module.css";

interface Props {
  params: Promise<{ scriptId: string }>;
}

export async function generateStaticParams() {
  return listScriptSummaries().map((script) => ({ scriptId: script.id }));
}

export const dynamicParams = false;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { scriptId } = await params;
  const script = getScriptById(scriptId);
  return {
    title: script ? `${script.name} — BotC Grimoire` : "BotC Grimoire",
  };
}

export default async function ScriptSheetPage({ params }: Props) {
  const { scriptId } = await params;
  const script = getScriptById(scriptId);
  if (!script) notFound();

  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <Link href="/" className={styles.back}>
          ← Scripts
        </Link>
        <h1 className={styles.title}>{script.name}</h1>
        {isTeensyvilleScript(script.meta) && <TeensyvilleBadge />}
        <ShareScriptButton meta={script.meta} characters={script.characters} />
        <Link href={`/scripts/${scriptId}/bag`} className={styles.buildBag}>
          Build the bag →
        </Link>
      </header>
      <ScriptSheet
        meta={script.meta}
        characters={script.characters}
        jinxes={script.jinxes}
      />
    </main>
  );
}
