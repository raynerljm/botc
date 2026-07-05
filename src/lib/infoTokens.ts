// The night-info cards a storyteller shows players away from the night list
// itself (issue #19) — distinct from a character's own night-sheet reminder
// text, which lives on Character.firstNightReminder/otherNightReminder.
export interface InfoTokenTemplate {
  id: string;
  text: string;
}

export const STANDARD_INFO_TOKENS: InfoTokenTemplate[] = [
  { id: "these-are-your-minions", text: "These are your minions" },
  { id: "this-is-the-demon", text: "This is the Demon" },
  { id: "you-are", text: "You are" },
  { id: "the-damsel-is-in-play", text: "The Damsel is in play" },
  { id: "did-you-nominate-today", text: "Did you nominate today?" },
];
