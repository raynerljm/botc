"use client";

import { useState } from "react";

import { allCharacters, type Character, type Team } from "@/lib/characters";
import {
  circlePosition,
  type Player,
  type PlayerPosition,
  type SetupWalkthroughStepStatus,
} from "@/lib/gameDocument";
import type { SetupWalkthroughStep } from "@/lib/setupWalkthrough";

import styles from "./SetupWalkthrough.module.css";

export interface SetupWalkthroughProps {
  steps: SetupWalkthroughStep[];
  stepStatuses: Record<string, SetupWalkthroughStepStatus>;
  players: Player[];
  // The game's own characters, offered before the rest of the dataset for
  // character pickers — same script-first precedent as issue #15's swap
  // picker and issue #14's reminder picker.
  characterPool: Character[];
  onAddReminder: (input: {
    characterId: string | null;
    label: string;
    position: PlayerPosition;
  }) => void;
  onResolveStep: (stepId: string, status: SetupWalkthroughStepStatus) => void;
  onClose: () => void;
}

function clampPct(value: number): number {
  return Math.min(96, Math.max(4, value));
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
  return { x: clampPct(base.x + 5), y: clampPct(base.y) };
}

function useCandidateCharacters(team: Team, characterPool: Character[]) {
  const [showAll, setShowAll] = useState(false);
  const scripted = characterPool.filter((c) => c.team === team);
  const everything = allCharacters.filter((c) => c.team === team);
  const list = showAll
    ? [
        ...scripted,
        ...everything.filter((c) => !scripted.some((s) => s.id === c.id)),
      ]
    : scripted;
  return { list, showAll, setShowAll };
}

interface StepPanelProps {
  step: SetupWalkthroughStep;
  status: SetupWalkthroughStepStatus | undefined;
  players: Player[];
  characterPool: Character[];
  onAddReminder: SetupWalkthroughProps["onAddReminder"];
  onResolveStep: SetupWalkthroughProps["onResolveStep"];
}

function StepPanel({
  step,
  status,
  players,
  characterPool,
  onAddReminder,
  onResolveStep,
}: StepPanelProps) {
  const [forceEditing, setForceEditing] = useState(false);
  const editing = forceEditing || status === undefined;
  const otherPlayers = players.filter((p) => p.id !== step.playerId);

  function resolve(nextStatus: SetupWalkthroughStepStatus) {
    onResolveStep(step.id, nextStatus);
    setForceEditing(false);
  }

  function skipButton() {
    return (
      <button type="button" onClick={() => resolve("skipped")}>
        Skip
      </button>
    );
  }

  return (
    <fieldset className={styles.step} data-status={status}>
      <legend>{step.title}</legend>
      <p>{step.ruleText}</p>

      {!editing && (
        <p className={styles.statusNote}>
          {status === "answered" ? "Answered" : "Skipped"}
          <button type="button" onClick={() => setForceEditing(true)}>
            Redo
          </button>
        </p>
      )}

      {editing && step.kind === "playerPick" && (
        <PlayerPickControls
          otherPlayers={otherPlayers}
          onConfirm={(playerId) => {
            onAddReminder({
              characterId: step.characterId,
              label: step.reminderLabel,
              position: anchorPosition(playerId, players),
            });
            resolve("answered");
          }}
          skip={skipButton}
        />
      )}

      {editing && step.kind === "characterAndTwoPlayers" && (
        <CharacterAndTwoPlayersControls
          step={step}
          otherPlayers={otherPlayers}
          characterPool={characterPool}
          onConfirm={(character, truePlayerId, falsePlayerId) => {
            onAddReminder({
              characterId: step.characterId,
              label: step.trueLabel,
              position: anchorPosition(truePlayerId, players),
            });
            onAddReminder({
              characterId: step.characterId,
              label: step.falseLabel,
              position: anchorPosition(falsePlayerId, players),
            });
            resolve("answered");
          }}
          skip={skipButton}
        />
      )}

      {editing && step.kind === "neighborCheck" && (
        <NeighborCheckControls
          step={step}
          onConfirm={(placeReminder) => {
            if (placeReminder) {
              onAddReminder({
                characterId: step.characterId,
                label: step.reminderLabel,
                position: anchorPosition(step.playerId, players),
              });
            }
            resolve("answered");
          }}
          skip={skipButton}
        />
      )}

      {editing && step.kind === "believedDemon" && (
        <BelievedDemonControls
          characterPool={characterPool}
          onConfirm={(demon) => {
            onAddReminder({
              characterId: null,
              label: `Thinks: ${demon.name}`,
              position: anchorPosition(step.playerId, players),
            });
            resolve("answered");
          }}
          skip={skipButton}
        />
      )}

      {editing && step.kind === "acknowledge" && (
        <div className={styles.controls}>
          <p>{step.message}</p>
          <button type="button" onClick={() => resolve("answered")}>
            Confirm
          </button>
          {skipButton()}
        </div>
      )}

      {editing && step.kind === "review" && (
        <ReviewControls
          step={step}
          onConfirm={(placeReminder) => {
            if (placeReminder) {
              onAddReminder({
                characterId: "drunk",
                label: step.reminderLabel,
                position: anchorPosition(step.playerId, players),
              });
            }
            resolve("answered");
          }}
          skip={skipButton}
        />
      )}

      {editing && step.kind === "generic" && (
        <GenericControls
          step={step}
          onAddReminder={(label) =>
            onAddReminder({
              characterId: step.characterId,
              label,
              position: anchorPosition(step.playerId, players),
            })
          }
          onDone={() => resolve("answered")}
          skip={skipButton}
        />
      )}
    </fieldset>
  );
}

function PlayerPickControls({
  otherPlayers,
  onConfirm,
  skip,
}: {
  otherPlayers: Player[];
  onConfirm: (playerId: string) => void;
  skip: () => React.ReactNode;
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
      {skip()}
    </div>
  );
}

function CharacterAndTwoPlayersControls({
  step,
  otherPlayers,
  characterPool,
  onConfirm,
  skip,
}: {
  step: Extract<SetupWalkthroughStep, { kind: "characterAndTwoPlayers" }>;
  otherPlayers: Player[];
  characterPool: Character[];
  onConfirm: (
    character: Character,
    truePlayerId: string,
    falsePlayerId: string,
  ) => void;
  skip: () => React.ReactNode;
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
      <label>
        <input
          type="checkbox"
          checked={showAll}
          onChange={(e) => setShowAll(e.target.checked)}
        />
        Show all characters
      </label>
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
      {skip()}
    </div>
  );
}

function NeighborCheckControls({
  step,
  onConfirm,
  skip,
}: {
  step: Extract<SetupWalkthroughStep, { kind: "neighborCheck" }>;
  onConfirm: (placeReminder: boolean) => void;
  skip: () => React.ReactNode;
}) {
  const [placeReminder, setPlaceReminder] = useState(true);
  return (
    <div className={styles.controls}>
      {step.seatedCorrectly ? (
        <p>Correctly seated next to the Demon.</p>
      ) : (
        <p>Not seated next to the Demon — move a player.</p>
      )}
      <label>
        <input
          type="checkbox"
          checked={placeReminder}
          onChange={(e) => setPlaceReminder(e.target.checked)}
        />
        {`Place "${step.reminderLabel}" reminder`}
      </label>
      <button type="button" onClick={() => onConfirm(placeReminder)}>
        Confirm
      </button>
      {skip()}
    </div>
  );
}

function BelievedDemonControls({
  characterPool,
  onConfirm,
  skip,
}: {
  characterPool: Character[];
  onConfirm: (demon: Character) => void;
  skip: () => React.ReactNode;
}) {
  const { list, showAll, setShowAll } = useCandidateCharacters(
    "demon",
    characterPool,
  );
  const [demonId, setDemonId] = useState("");
  const demon = list.find((c) => c.id === demonId);

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
      <label>
        <input
          type="checkbox"
          checked={showAll}
          onChange={(e) => setShowAll(e.target.checked)}
        />
        Show all characters
      </label>
      <button
        type="button"
        disabled={!demon}
        onClick={() => demon && onConfirm(demon)}
      >
        Confirm
      </button>
      {skip()}
    </div>
  );
}

function ReviewControls({
  step,
  onConfirm,
  skip,
}: {
  step: Extract<SetupWalkthroughStep, { kind: "review" }>;
  onConfirm: (placeReminder: boolean) => void;
  skip: () => React.ReactNode;
}) {
  const [placeReminder, setPlaceReminder] = useState(true);
  return (
    <div className={styles.controls}>
      <label>
        <input
          type="checkbox"
          checked={placeReminder}
          onChange={(e) => setPlaceReminder(e.target.checked)}
        />
        {`Place "${step.reminderLabel}" reminder`}
      </label>
      <button type="button" onClick={() => onConfirm(placeReminder)}>
        Confirm
      </button>
      {skip()}
    </div>
  );
}

function GenericControls({
  step,
  onAddReminder,
  onDone,
  skip,
}: {
  step: Extract<SetupWalkthroughStep, { kind: "generic" }>;
  onAddReminder: (label: string) => void;
  onDone: () => void;
  skip: () => React.ReactNode;
}) {
  return (
    <div className={styles.controls}>
      <div className={styles.reminderOptions}>
        {step.reminderOptions.map((label) => (
          <button key={label} type="button" onClick={() => onAddReminder(label)}>
            {label}
          </button>
        ))}
      </div>
      <button type="button" onClick={onDone}>
        Done
      </button>
      {skip()}
    </div>
  );
}

export function SetupWalkthrough({
  steps,
  stepStatuses,
  players,
  characterPool,
  onAddReminder,
  onResolveStep,
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
              onAddReminder={onAddReminder}
              onResolveStep={onResolveStep}
            />
          </li>
        ))}
      </ol>
    </div>
  );
}
