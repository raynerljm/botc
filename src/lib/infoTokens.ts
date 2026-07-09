// The night-info cards a storyteller shows players away from the night list
// itself (issue #19) — distinct from a character's own night-sheet reminder
// text, which lives on Character.firstNightReminder/otherNightReminder.
export interface InfoTokenTemplate {
  id: string;
  text: string;
  // Restricts this card to games whose script includes this character (e.g.
  // "The Damsel is in play" is noise outside a Damsel game) — omitted for
  // cards relevant to every script (issue #161, self-QA item 9).
  characterId?: string;
}

export const STANDARD_INFO_TOKENS: InfoTokenTemplate[] = [
  { id: "these-are-your-minions", text: "These are your minions" },
  { id: "this-is-the-demon", text: "This is the Demon" },
  { id: "you-are", text: "You are" },
  { id: "did-you-nominate-today", text: "Did you nominate today?" },
  { id: "make-your-choice", text: "Make your choice" },
  { id: "use-your-ability", text: "Use your ability?" },
  {
    id: "the-damsel-is-in-play",
    text: "The Damsel is in play",
    characterId: "damsel",
  },
  {
    id: "this-player-attacked",
    text: "This player attacked",
    characterId: "lunatic",
  },
];

// The cards relevant to this script: every basic card, plus each
// character-gated card whose character is actually in play.
export function visibleInfoTokens(
  scriptCharacterIds: Set<string>,
): InfoTokenTemplate[] {
  return STANDARD_INFO_TOKENS.filter(
    (template) =>
      !template.characterId || scriptCharacterIds.has(template.characterId),
  );
}
