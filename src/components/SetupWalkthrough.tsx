"use client";

import { useRef, useState, type ReactNode } from "react";

import { allCharacters, type Character, type Team } from "@/lib/characters";
import {
  DRUNK_ID,
  heldCharacterIds,
  livePlayerPosition,
  LUNATIC_ID,
  parkBeside,
  type GameDocument,
  type Player,
  type PlayerPosition,
  type SetupWalkthroughStepStatus,
} from "@/lib/gameDocument";
import type { SetupWalkthroughStep } from "@/lib/setupWalkthrough";

import { Button } from "./Button";
import { Checkbox } from "./Checkbox";
import { DemonBluffsFields } from "./DemonBluffsPanel";
import { Select } from "./Select";
import styles from "./SetupWalkthrough.module.css";
import { useDialogDismiss } from "./useDialogDismiss";

// What a resolved step hands back to be persisted as reminder tokens — never
// a new field on GameDocument, so a step's actual decision (who's the red
// herring, which character was claimed, ...) always lives only as ordinary
// reminders (issue #26 AC).
export interface SetupWalkthroughReminderInput {
  characterId: string | null;
  label: string;
  position: PlayerPosition;
  anchorPlayerId: string | null;
}

export interface SetupWalkthroughProps {
  steps: SetupWalkthroughStep[];
  stepStatuses: Record<string, SetupWalkthroughStepStatus>;
  players: Player[];
  // The game's own characters, offered before the rest of the dataset for
  // character pickers — same script-first precedent as issue #15's swap
  // picker and issue #14's reminder picker.
  characterPool: Character[];
  // The whole document, plus a whole-document setter — needed only by the
  // demonBluffs step, which mounts DemonBluffsFields (the same component the
  // standalone board panel uses) rather than a narrower, step-specific
  // control (issue #155). Every other step keeps using the narrower
  // players/characterPool props above.
  game: GameDocument;
  onChangeGame: (next: GameDocument) => void;
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
  return parkBeside(livePlayerPosition(playerId, players));
}

function characterOf(
  player: Player,
  characterById: Map<string, Character>,
): Character | undefined {
  return player.characterId ? characterById.get(player.characterId) : undefined;
}

// Fortune Teller's red herring, Grandmother's grandchild, and the Evil
// Twin's counterpart must all be a *good* player (each ability's text says
// so explicitly) — a player's real alignment, not what they believe
// themselves to be, so a Marionette (evil, thinks they're good) is
// correctly excluded and a Drunk (good, playing a Townsfolk stand-in) is
// correctly included.
function isGoodPlayer(player: Player, characterById: Map<string, Character>): boolean {
  if (player.isTraveller) return player.travellerAlignment === "good";
  const character = characterOf(player, characterById);
  return character?.team === "townsfolk" || character?.team === "outsider";
}

// The storyteller already knows every player's assigned character, so
// showing it alongside their name (issue #56) makes a player-pick faster
// and less error-prone than matching bare names to seats by memory. A
// disguised Drunk/Lunatic is flagged here too (code review finding) — this
// picker has no token or reminder chip nearby to read the seat's true state
// from, unlike the grimoire board (issue #186), so the inline flag stays.
function playerOptionLabel(
  player: Player,
  characterById: Map<string, Character>,
): string {
  const character = characterOf(player, characterById);
  if (!character) return player.name;
  const label = `${player.name} — ${character.name}`;
  if (player.isDrunk && character.id !== DRUNK_ID) {
    return `${label} (actually the Drunk)`;
  }
  if (player.isLunatic && character.id !== LUNATIC_ID) {
    return `${label} (actually the Lunatic)`;
  }
  return label;
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
  game: GameDocument;
  onChangeGame: (next: GameDocument) => void;
  onResolveStep: SetupWalkthroughProps["onResolveStep"];
  onReassignStandIn: SetupWalkthroughProps["onReassignStandIn"];
}

function StepPanel({
  step,
  status,
  players,
  characterPool,
  game,
  onChangeGame,
  onResolveStep,
  onReassignStandIn,
}: StepPanelProps) {
  const [forceEditing, setForceEditing] = useState(false);
  const editing = forceEditing || status === undefined;
  // A script-level step (demonBluffs, currently the only one) isn't anchored
  // to any one player, so there's no "other players" to compute for it —
  // checked structurally (any step kind without a playerId), not by name, so
  // a future script-level kind doesn't need its own special case here too.
  const otherPlayers =
    "playerId" in step ? players.filter((p) => p.id !== step.playerId) : [];
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
          team={step.standInTeam}
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
          <Button variant="ghost" onClick={() => setForceEditing(true)}>
            Redo
          </Button>
        </p>
      )}

      {editing && (
        <>
          {step.kind === "demonBluffs" && (
            <ConfirmOnlyControls onConfirm={() => resolve("answered")}>
              <DemonBluffsFields
                game={game}
                onChange={onChangeGame}
                showToDemonButton={false}
              />
            </ConfirmOnlyControls>
          )}

          {step.kind === "playerPick" && (
            <PlayerPickControls
              otherPlayers={goodOtherPlayers}
              characterById={characterById}
              onConfirm={(playerId) =>
                resolve("answered", [
                  {
                    characterId: step.characterId,
                    label: step.reminderLabel,
                    position: anchorPosition(playerId, players),
                    anchorPlayerId: playerId,
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
              characterById={characterById}
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
                    anchorPlayerId: truePlayerId,
                  },
                  {
                    characterId: step.characterId,
                    label: `${step.falseLabel} (${character.name})`,
                    position: anchorPosition(falsePlayerId, players),
                    anchorPlayerId: falsePlayerId,
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
                          anchorPlayerId: step.playerId,
                        },
                      ]
                    : [],
                )
              }
            />
          )}

          {step.kind === "acknowledge" && (
            <ConfirmOnlyControls onConfirm={() => resolve("answered")}>
              <p>{step.message}</p>
            </ConfirmOnlyControls>
          )}

          {/* The Drunk's own reminder is placed automatically the moment
              the stand-in lands on a seat (GrimoireSetup's
              chooseToken/assignManually, issue #186) — this step just
              confirms, or it would duplicate that reminder. The Lunatic
              (issue #163) still places its own here, unaffected. */}
          {step.kind === "review" && step.disguiseId === DRUNK_ID && (
            <ConfirmOnlyControls onConfirm={() => resolve("answered")}>
              <p>{`The "${step.reminderLabel}" reminder token is already on their seat.`}</p>
            </ConfirmOnlyControls>
          )}

          {step.kind === "review" && step.disguiseId !== DRUNK_ID && (
            <ReminderToggleControls
              reminderLabel={step.reminderLabel}
              onConfirm={(placeReminder) =>
                resolve(
                  "answered",
                  placeReminder
                    ? [
                        {
                          // The seat's true identity, not the stand-in
                          // character's — step.characterId is the stand-in
                          // (e.g. "washerwoman"), which isn't who this
                          // reminder is about.
                          characterId: step.disguiseId,
                          label: step.reminderLabel,
                          position: anchorPosition(step.playerId, players),
                          anchorPlayerId: step.playerId,
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
              onConfirm={(labels) =>
                resolve(
                  "answered",
                  labels.map((label) => ({
                    characterId: step.characterId,
                    label,
                    position: anchorPosition(step.playerId, players),
                    anchorPlayerId: step.playerId,
                  })),
                )
              }
            />
          )}

          <Button onClick={() => resolve("skipped")}>Skip</Button>
        </>
      )}
    </fieldset>
  );
}

// Shared by the acknowledge and demonBluffs steps — both are just some
// content (a message, or the bluff picker) plus a single, unconditional
// Confirm — no fields to gate it on, unlike every other kind's controls.
function ConfirmOnlyControls({
  onConfirm,
  children,
}: {
  onConfirm: () => void;
  children: ReactNode;
}) {
  return (
    <div className={styles.controls}>
      {children}
      <Button variant="primary" onClick={onConfirm}>
        Confirm
      </Button>
    </div>
  );
}

function PlayerPickControls({
  otherPlayers,
  characterById,
  onConfirm,
}: {
  otherPlayers: Player[];
  characterById: Map<string, Character>;
  onConfirm: (playerId: string) => void;
}) {
  const [playerId, setPlayerId] = useState("");
  return (
    <div className={styles.controls}>
      <label>
        Player
        <Select
          aria-label="Player"
          value={playerId}
          onChange={setPlayerId}
          entries={[
            { value: "", label: "Choose a player…" },
            ...otherPlayers.map((p) => ({
              value: p.id,
              label: playerOptionLabel(p, characterById),
            })),
          ]}
        />
      </label>
      <Button
        variant="primary"
        disabled={!playerId}
        onClick={() => onConfirm(playerId)}
      >
        Confirm
      </Button>
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
      <Checkbox checked={showAll} onChange={onChange} />
      Show all characters
    </label>
  );
}

function CharacterAndTwoPlayersControls({
  step,
  otherPlayers,
  characterPool,
  characterById,
  onConfirm,
}: {
  step: Extract<SetupWalkthroughStep, { kind: "characterAndTwoPlayers" }>;
  otherPlayers: Player[];
  characterPool: Character[];
  characterById: Map<string, Character>;
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
        <Select
          aria-label="Character"
          value={characterId}
          onChange={setCharacterId}
          entries={[
            { value: "", label: "Choose a character…" },
            ...list.map((c) => ({ value: c.id, label: c.name })),
          ]}
        />
      </label>
      <ShowAllToggle showAll={showAll} onChange={handleShowAllChange} />
      <label>
        {`Shown as ${step.trueLabel}`}
        <Select
          aria-label={`Shown as ${step.trueLabel}`}
          value={truePlayerId}
          onChange={setTruePlayerId}
          entries={[
            { value: "", label: "Choose a player…" },
            ...otherPlayers.map((p) => ({
              value: p.id,
              label: playerOptionLabel(p, characterById),
            })),
          ]}
        />
      </label>
      <label>
        {`Shown as ${step.falseLabel}`}
        <Select
          aria-label={`Shown as ${step.falseLabel}`}
          value={falsePlayerId}
          onChange={setFalsePlayerId}
          entries={[
            { value: "", label: "Choose a player…" },
            ...otherPlayers.map((p) => ({
              value: p.id,
              label: playerOptionLabel(p, characterById),
            })),
          ]}
        />
      </label>
      <Button
        variant="primary"
        disabled={!canConfirm}
        onClick={() => character && onConfirm(character, truePlayerId, falsePlayerId)}
      >
        Confirm
      </Button>
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
        <Checkbox checked={placeReminder} onChange={setPlaceReminder} />
        {`Place "${reminderLabel}" reminder`}
      </label>
      <Button variant="primary" onClick={() => onConfirm(placeReminder)}>
        Confirm
      </Button>
    </div>
  );
}

// Lets the storyteller revise the seat's stand-in after bag-building's
// initial pick (issue #52, generalised to the Lunatic's Demon stand-in by
// issue #163) — a separate action from the reminder-toggle below it, since
// it changes what the grimoire records rather than placing a reminder, and
// doesn't move this step's answered/skipped status.
function StandInReassignControls({
  team,
  currentCharacterId,
  currentCharacterName,
  heldElsewhereIds,
  characterPool,
  onConfirm,
}: {
  // townsfolk for the Drunk, demon for the Lunatic.
  team: Team;
  currentCharacterId: string;
  currentCharacterName: string;
  // Characters of `team` currently held by some other seated player —
  // excluded from the picker (issue #52 AC: "not already in play as another
  // character").
  heldElsewhereIds: Set<string>;
  characterPool: Character[];
  onConfirm: (characterId: string) => void;
}) {
  const { list, showAll, setShowAll } = useCandidateCharacters(
    team,
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
        <Select
          aria-label="New stand-in"
          value={characterId}
          onChange={setCharacterId}
          entries={[
            { value: "", label: "Choose a character…" },
            ...candidates.map((c) => ({ value: c.id, label: c.name })),
          ]}
        />
      </label>
      <ShowAllToggle showAll={showAll} onChange={handleShowAllChange} />
      <Button
        variant="primary"
        disabled={!chosen || chosen.id === currentCharacterId}
        onClick={() => chosen && onConfirm(chosen.id)}
      >
        Change stand-in
      </Button>
    </div>
  );
}

function GenericControls({
  step,
  onConfirm,
}: {
  step: Extract<SetupWalkthroughStep, { kind: "generic" }>;
  onConfirm: (labels: string[]) => void;
}) {
  // Staged locally rather than added immediately on each click, so a step
  // that places several reminders still resolves through one onConfirm call —
  // consistent with every other kind, and what makes Redo able to clean up
  // exactly the set this step last produced.
  const [staged, setStaged] = useState<string[]>([]);

  return (
    <div className={styles.controls}>
      <div className={styles.reminderOptions}>
        {step.reminderOptions.map((label) => (
          <Button
            key={label}
            onClick={() => setStaged((current) => [...current, label])}
          >
            {label}
          </Button>
        ))}
      </div>
      {staged.length > 0 && (
        <ul className={styles.stagedList}>
          {staged.map((label, index) => (
            <li key={index}>{label}</li>
          ))}
        </ul>
      )}
      {/* "Confirm", matching every other step kind's resolve action — not
          "Done", which would collide with the walkthrough's own footer Done
          button (issue #244 code review finding) whenever a homebrew step
          is still open. */}
      <Button variant="primary" onClick={() => onConfirm(staged)}>
        Confirm
      </Button>
    </div>
  );
}

export function SetupWalkthrough({
  steps,
  stepStatuses,
  players,
  characterPool,
  game,
  onChangeGame,
  onResolveStep,
  onReassignStandIn,
  onClose,
}: SetupWalkthroughProps) {
  const resolvedCount = steps.filter((s) => stepStatuses[s.id]).length;
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // The opaque backdrop reads as a true modal, but nothing outside this
  // component makes the rest of the page inert — GrimoireSetup keeps
  // ShareScriptButton/EndGamePanel mounted and focusable underneath it
  // (deliberately, so they stay reachable while the device is obscured
  // mid-draw; see its "always reachable" comment) — so without a real Tab
  // trap, Tab could silently reach "Good wins"/"Evil wins" behind the
  // backdrop (code review finding, issue #122).
  useDialogDismiss(dialogRef, closeButtonRef, onClose);

  return (
    <div className={styles.overlay}>
      <div
        ref={dialogRef}
        className={styles.walkthrough}
        role="dialog"
        aria-label="Setup walkthrough"
        aria-modal="true"
      >
        <header className={styles.header}>
          <h2>Setup walkthrough</h2>
          <p>
            {resolvedCount}/{steps.length} handled
          </p>
          <Button variant="ghost" ref={closeButtonRef} onClick={onClose}>
            Close
          </Button>
        </header>
        <ol className={styles.steps}>
          {steps.map((step) => (
            <li key={step.id}>
              <StepPanel
                step={step}
                status={stepStatuses[step.id]}
                players={players}
                characterPool={characterPool}
                game={game}
                onChangeGame={onChangeGame}
                onResolveStep={onResolveStep}
                onReassignStandIn={onReassignStandIn}
              />
            </li>
          ))}
        </ol>
        {/* Always enabled — the storyteller may handle or skip steps in any
            order and close when ready (ADR 0003, advisory never blocking).
            Sticky, so it stays reachable below a long, internally-scrolling
            step list (issue #244). */}
        <footer className={styles.footer}>
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        </footer>
      </div>
    </div>
  );
}
