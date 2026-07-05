"use client";

import { useState } from "react";

import { allCharacters, type Character, type Team } from "@/lib/characters";
import {
  circlePosition,
  heldCharacterIds,
  parkBeside,
  type Player,
  type PlayerPosition,
  type SetupWalkthroughStepStatus,
} from "@/lib/gameDocument";
import type { SetupWalkthroughStep } from "@/lib/setupWalkthrough";

import styles from "./SetupWalkthrough.module.css";

// What a resolved step hands back to be persisted as reminder tokens — never
// a new field on GameDocument, so a step's actual decision (who's the red
// herring, which character was claimed, ...) always lives only as ordinary
// reminders (issue #26 AC).
export interface SetupWalkthroughReminderInput {
  characterId: string | null;
  label: string;
  position: PlayerPosition;
}

export interface SetupWalkthroughProps {
  steps: SetupWalkthroughStep[];
  stepStatuses: Record<string, SetupWalkthroughStepStatus>;
  players: Player[];
  // The game's own characters, offered before the rest of the dataset for
  // character pickers — same script-first precedent as issue #15's swap
  // picker and issue #14's reminder picker.
  characterPool: Character[];
  // Bundles the reminders a step produces with its resolution into one call
  // so re-answering a step (Redo) can atomically swap out its previous
  // reminders for the new ones — see GrimoireSetup.tsx's resolveWalkthroughStep.
  onResolveStep: (
    stepId: string,
    status: SetupWalkthroughStepStatus,
    reminders: SetupWalkthroughReminderInput[],
  ) => void;
  // Changes which Townsfolk the Drunk's player believes they are (issue
  // #52) — a separate channel from onResolveStep since it isn't a reminder
  // and doesn't touch this step's answered/skipped status.
  onReassignStandIn: (playerId: string, characterId: string) => void;
  onClose: () => void;
}

// A placed reminder starts a little offset from its anchor player, the same
// "parked beside them" convention GrimoireBoard uses when a reminder is
// added from a player's own token menu.
function anchorPosition(playerId: string, players: Player[]): PlayerPosition {
  const player = players.find((p) => p.id === playerId);
  const sorted = [...players].sort((a, b) => a.seat - b.seat);
  const base =
    player?.position ??
    circlePosition(
      sorted.findIndex((p) => p.id === playerId),
      sorted.length,
    );
  return parkBeside(base);
}

// Fortune Teller's red herring, Grandmother's grandchild, and the Evil
// Twin's counterpart must all be a *good* player (each ability's text says
// so explicitly) — a player's real alignment, not what they believe
// themselves to be, so a Marionette (evil, thinks they're good) is
// correctly excluded and a Drunk (good, playing a Townsfolk stand-in) is
// correctly included.
function isGoodPlayer(player: Player, characterById: Map<string, Character>): boolean {
  if (player.isTraveller) return player.travellerAlignment === "good";
  const character = player.characterId ? characterById.get(player.characterId) : undefined;
  return character?.team === "townsfolk" || character?.team === "outsider";
}

function useCandidateCharacters(team: Team, characterPool: Character[]) {
  const [showAll, setShowAll] = useState(false);
  const scripted = characterPool.filter((c) => c.team === team);
  const list = showAll
    ? [
        ...scripted,
        ...allCharacters.filter(
          (c) => c.team === team && !scripted.some((s) => s.id === c.id),
        ),
      ]
    : scripted;
  return { list, showAll, setShowAll };
}

interface StepPanelProps {
  step: SetupWalkthroughStep;
  status: SetupWalkthroughStepStatus | undefined;
  players: Player[];
  characterPool: Character[];
  onResolveStep: SetupWalkthroughProps["onResolveStep"];
  onReassignStandIn: SetupWalkthroughProps["onReassignStandIn"];
}

function StepPanel({
  step,
  status,
  players,
  characterPool,
  onResolveStep,
  onReassignStandIn,
}: StepPanelProps) {
  const [forceEditing, setForceEditing] = useState(false);
  const editing = forceEditing || status === undefined;
  const otherPlayers = players.filter((p) => p.id !== step.playerId);
  const characterById = new Map(characterPool.map((c) => [c.id, c] as const));
  // Every curated playerPick (Fortune Teller's red herring, Grandmother's
  // grandchild, the Evil Twin's counterpart) requires a good player by rule
  // — filtering here, not in the table, since it's a property of the *kind*
  // rather than any one character.
  const goodOtherPlayers = otherPlayers.filter((p) => isGoodPlayer(p, characterById));

  // Bundling every reminder a step produces with its status into one call
  // (rather than separate add-reminder-then-resolve calls) is what makes
  // Redo safe: GrimoireSetup's resolveWalkthroughStep replaces this step's
  // *previous* reminders with this set atomically, so re-answering never
  // leaves a stale token from the first answer behind.
  function resolve(
    nextStatus: SetupWalkthroughStepStatus,
    reminders: SetupWalkthroughReminderInput[] = [],
  ) {
    onResolveStep(step.id, nextStatus, reminders);
    setForceEditing(false);
  }

  return (
    <fieldset className={styles.step} data-status={status}>
      <legend>{step.title}</legend>
      <p>{step.ruleText}</p>

      {/* Reassigning the stand-in is a separate action from resolving this
          step's reminder (issue #52) — it stays available even once the
          step is answered/skipped, not gated behind editing/Redo like the
          rest of this panel. */}
      {step.kind === "review" && (
        <StandInReassignControls
          currentCharacterId={step.characterId}
          currentCharacterName={step.characterName}
          heldElsewhereIds={heldCharacterIds(otherPlayers)}
          characterPool={characterPool}
          onConfirm={(characterId) =>
            onReassignStandIn(step.playerId, characterId)
          }
        />
      )}

      {!editing && (
        <p className={styles.statusNote}>
          {status === "answered" ? "Answered" : "Skipped"}
          <button type="button" onClick={() => setForceEditing(true)}>
            Redo
          </button>
        </p>
      )}

      {editing && (
        <>
          {step.kind === "playerPick" && (
            <PlayerPickControls
              otherPlayers={goodOtherPlayers}
              onConfirm={(playerId) =>
                resolve("answered", [
                  {
                    characterId: step.characterId,
                    label: step.reminderLabel,
                    position: anchorPosition(playerId, players),
                  },
                ])
              }
            />
          )}

          {step.kind === "characterAndTwoPlayers" && (
            <CharacterAndTwoPlayersControls
              step={step}
              otherPlayers={otherPlayers}
              characterPool={characterPool}
              onConfirm={(character, truePlayerId, falsePlayerId) =>
                resolve("answered", [
                  {
                    characterId: step.characterId,
                    // The claimed character's name rides along in the label
                    // itself — otherwise which specific character (e.g.
                    // "Chef") was claimed is lost the moment this resolves,
                    // with nothing recording it (code review finding).
                    label: `${step.trueLabel} (${character.name})`,
                    position: anchorPosition(truePlayerId, players),
                  },
                  {
                    characterId: step.characterId,
                    label: `${step.falseLabel} (${character.name})`,
                    position: anchorPosition(falsePlayerId, players),
                  },
                ])
              }
            />
          )}

          {step.kind === "neighborCheck" && (
            <ReminderToggleControls
              note={
                step.seatedCorrectly
                  ? "Correctly seated next to the Demon."
                  : "Not seated next to the Demon — move a player."
              }
              reminderLabel={step.reminderLabel}
              onConfirm={(placeReminder) =>
                resolve(
                  "answered",
                  placeReminder
                    ? [
                        {
                          characterId: step.characterId,
                          label: step.reminderLabel,
                          position: anchorPosition(step.playerId, players),
                        },
                      ]
                    : [],
                )
              }
            />
          )}

          {step.kind === "believedDemon" && (
            <BelievedDemonControls
              characterPool={characterPool}
              onConfirm={(demon) =>
                resolve("answered", [
                  {
                    characterId: null,
                    label: `Thinks: ${demon.name}`,
                    position: anchorPosition(step.playerId, players),
                  },
                ])
              }
            />
          )}

          {step.kind === "acknowledge" && (
            <div className={styles.controls}>
              <p>{step.message}</p>
              <button type="button" onClick={() => resolve("answered")}>
                Confirm
              </button>
            </div>
          )}

          {step.kind === "review" && (
            <ReminderToggleControls
              reminderLabel={step.reminderLabel}
              onConfirm={(placeReminder) =>
                resolve(
                  "answered",
                  placeReminder
                    ? [
                        {
                          // The Drunk's own reminder, not the stand-in
                          // character's — step.characterId is the stand-in
                          // (e.g. "washerwoman"), which isn't who this
                          // reminder is about.
                          characterId: "drunk",
                          label: step.reminderLabel,
                          position: anchorPosition(step.playerId, players),
                        },
                      ]
                    : [],
                )
              }
            />
          )}

          {step.kind === "generic" && (
            <GenericControls
              step={step}
              onDone={(labels) =>
                resolve(
                  "answered",
                  labels.map((label) => ({
                    characterId: step.characterId,
                    label,
                    position: anchorPosition(step.playerId, players),
                  })),
                )
              }
            />
          )}

          <button type="button" onClick={() => resolve("skipped")}>
            Skip
          </button>
        </>
      )}
    </fieldset>
  );
}

function PlayerPickControls({
  otherPlayers,
  onConfirm,
}: {
  otherPlayers: Player[];
  onConfirm: (playerId: string) => void;
}) {
  const [playerId, setPlayerId] = useState("");
  return (
    <div className={styles.controls}>
      <label>
        Player
        <select value={playerId} onChange={(e) => setPlayerId(e.target.value)}>
          <option value="">Choose a player…</option>
          {otherPlayers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        disabled={!playerId}
        onClick={() => onConfirm(playerId)}
      >
        Confirm
      </button>
    </div>
  );
}

function ShowAllToggle({
  showAll,
  onChange,
}: {
  showAll: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label>
      <input
        type="checkbox"
        checked={showAll}
        onChange={(e) => onChange(e.target.checked)}
      />
      Show all characters
    </label>
  );
}

function CharacterAndTwoPlayersControls({
  step,
  otherPlayers,
  characterPool,
  onConfirm,
}: {
  step: Extract<SetupWalkthroughStep, { kind: "characterAndTwoPlayers" }>;
  otherPlayers: Player[];
  characterPool: Character[];
  onConfirm: (
    character: Character,
    truePlayerId: string,
    falsePlayerId: string,
  ) => void;
}) {
  const { list, showAll, setShowAll } = useCandidateCharacters(
    step.candidateTeam,
    characterPool,
  );
  const [characterId, setCharacterId] = useState("");
  const [truePlayerId, setTruePlayerId] = useState("");
  const [falsePlayerId, setFalsePlayerId] = useState("");
  const character = list.find((c) => c.id === characterId);
  const canConfirm =
    !!character &&
    !!truePlayerId &&
    !!falsePlayerId &&
    truePlayerId !== falsePlayerId;

  // Unchecking "show all" can drop the currently-picked character out of
  // `list` (if it isn't on the script) — reset the selection instead of
  // leaving Confirm silently disabled with no visible reason why.
  function handleShowAllChange(next: boolean) {
    setShowAll(next);
    if (!next && characterId && !characterPool.some((c) => c.id === characterId)) {
      setCharacterId("");
    }
  }

  return (
    <div className={styles.controls}>
      <label>
        Character
        <select
          value={characterId}
          onChange={(e) => setCharacterId(e.target.value)}
        >
          <option value="">Choose a character…</option>
          {list.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <ShowAllToggle showAll={showAll} onChange={handleShowAllChange} />
      <label>
        {`Shown as ${step.trueLabel}`}
        <select
          value={truePlayerId}
          onChange={(e) => setTruePlayerId(e.target.value)}
        >
          <option value="">Choose a player…</option>
          {otherPlayers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        {`Shown as ${step.falseLabel}`}
        <select
          value={falsePlayerId}
          onChange={(e) => setFalsePlayerId(e.target.value)}
        >
          <option value="">Choose a player…</option>
          {otherPlayers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        disabled={!canConfirm}
        onClick={() => character && onConfirm(character, truePlayerId, falsePlayerId)}
      >
        Confirm
      </button>
    </div>
  );
}

// Shared by the neighborCheck (Marionette) and review (Drunk) steps — both
// are a single reminder-or-not toggle plus an optional note, differing only
// in whether they show a seating-check message first.
function ReminderToggleControls({
  note,
  reminderLabel,
  onConfirm,
}: {
  note?: string;
  reminderLabel: string;
  onConfirm: (placeReminder: boolean) => void;
}) {
  const [placeReminder, setPlaceReminder] = useState(true);
  return (
    <div className={styles.controls}>
      {note && <p>{note}</p>}
      <label>
        <input
          type="checkbox"
          checked={placeReminder}
          onChange={(e) => setPlaceReminder(e.target.checked)}
        />
        {`Place "${reminderLabel}" reminder`}
      </label>
      <button type="button" onClick={() => onConfirm(placeReminder)}>
        Confirm
      </button>
    </div>
  );
}

function BelievedDemonControls({
  characterPool,
  onConfirm,
}: {
  characterPool: Character[];
  onConfirm: (demon: Character) => void;
}) {
  const { list, showAll, setShowAll } = useCandidateCharacters(
    "demon",
    characterPool,
  );
  const [demonId, setDemonId] = useState("");
  const demon = list.find((c) => c.id === demonId);

  function handleShowAllChange(next: boolean) {
    setShowAll(next);
    if (!next && demonId && !characterPool.some((c) => c.id === demonId)) {
      setDemonId("");
    }
  }

  return (
    <div className={styles.controls}>
      <label>
        Demon
        <select value={demonId} onChange={(e) => setDemonId(e.target.value)}>
          <option value="">Choose a demon…</option>
          {list.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <ShowAllToggle showAll={showAll} onChange={handleShowAllChange} />
      <button
        type="button"
        disabled={!demon}
        onClick={() => demon && onConfirm(demon)}
      >
        Confirm
      </button>
    </div>
  );
}

// Lets the storyteller revise the Drunk's stand-in after bag-building's
// initial pick (issue #52) — a separate action from the reminder-toggle
// below it, since it changes what the grimoire records rather than placing
// a reminder, and doesn't move this step's answered/skipped status.
function StandInReassignControls({
  currentCharacterId,
  currentCharacterName,
  heldElsewhereIds,
  characterPool,
  onConfirm,
}: {
  currentCharacterId: string;
  currentCharacterName: string;
  // Townsfolk currently held by some other seated player — excluded from
  // the picker (issue #52 AC: "not already in play as another character").
  heldElsewhereIds: Set<string>;
  characterPool: Character[];
  onConfirm: (characterId: string) => void;
}) {
  const { list, showAll, setShowAll } = useCandidateCharacters(
    "townsfolk",
    characterPool,
  );
  const candidates = list.filter((c) => !heldElsewhereIds.has(c.id));
  const [characterId, setCharacterId] = useState("");
  const chosen = candidates.find((c) => c.id === characterId);

  function handleShowAllChange(next: boolean) {
    setShowAll(next);
    if (!next && characterId && !characterPool.some((c) => c.id === characterId)) {
      setCharacterId("");
    }
  }

  return (
    <div className={styles.controls}>
      <p>{`Current stand-in: ${currentCharacterName}`}</p>
      <label>
        New stand-in
        <select
          value={characterId}
          onChange={(e) => setCharacterId(e.target.value)}
        >
          <option value="">Choose a character…</option>
          {candidates.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <ShowAllToggle showAll={showAll} onChange={handleShowAllChange} />
      <button
        type="button"
        disabled={!chosen || chosen.id === currentCharacterId}
        onClick={() => chosen && onConfirm(chosen.id)}
      >
        Change stand-in
      </button>
    </div>
  );
}

function GenericControls({
  step,
  onDone,
}: {
  step: Extract<SetupWalkthroughStep, { kind: "generic" }>;
  onDone: (labels: string[]) => void;
}) {
  // Staged locally rather than added immediately on each click, so a step
  // that places several reminders still resolves through one onDone call —
  // consistent with every other kind, and what makes Redo able to clean up
  // exactly the set this step last produced.
  const [staged, setStaged] = useState<string[]>([]);

  return (
    <div className={styles.controls}>
      <div className={styles.reminderOptions}>
        {step.reminderOptions.map((label) => (
          <button
            key={label}
            type="button"
            onClick={() => setStaged((current) => [...current, label])}
          >
            {label}
          </button>
        ))}
      </div>
      {staged.length > 0 && (
        <ul className={styles.stagedList}>
          {staged.map((label, index) => (
            <li key={index}>{label}</li>
          ))}
        </ul>
      )}
      <button type="button" onClick={() => onDone(staged)}>
        Done
      </button>
    </div>
  );
}

export function SetupWalkthrough({
  steps,
  stepStatuses,
  players,
  characterPool,
  onResolveStep,
  onReassignStandIn,
  onClose,
}: SetupWalkthroughProps) {
  const resolvedCount = steps.filter((s) => stepStatuses[s.id]).length;

  return (
    <div
      className={styles.walkthrough}
      role="dialog"
      aria-label="Setup walkthrough"
    >
      <header className={styles.header}>
        <h2>Setup walkthrough</h2>
        <p>
          {resolvedCount}/{steps.length} handled
        </p>
        <button type="button" onClick={onClose}>
          Close
        </button>
      </header>
      <ol className={styles.steps}>
        {steps.map((step) => (
          <li key={step.id}>
            <StepPanel
              step={step}
              status={stepStatuses[step.id]}
              players={players}
              characterPool={characterPool}
              onResolveStep={onResolveStep}
              onReassignStandIn={onReassignStandIn}
            />
          </li>
        ))}
      </ol>
    </div>
  );
}
