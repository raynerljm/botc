import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { BagBuilder } from "@/components/BagBuilder";
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
    title: script ? `Build the bag — ${script.name}` : "BotC Grimoire",
  };
}

export default async function BagBuilderPage({ params }: Props) {
  const { scriptId } = await params;
  const script = getScriptById(scriptId);
  if (!script) notFound();

  return (
    <main>
      <header className={styles.header}>
        <Link href={`/scripts/${scriptId}`} className={styles.back}>
          ← {script.name}
        </Link>
        <h1 className={styles.title}>{script.name}</h1>
      </header>
      <BagBuilder
        characters={script.characters}
        scriptId={scriptId}
        scriptName={script.name}
        almanacUrl={script.meta.almanac}
      />
    </main>
  );
}
