"use client";

import { useMemo, useState } from "react";

import {
  allCharacters,
  getCharacter,
  groupByTeam,
  teamNames,
  type Character,
  type Team,
} from "@/lib/characters";
import { computeActiveJinxes } from "@/lib/scriptParser";
import {
  MAX_PLAYERS,
  MAX_TRAVELLERS,
  MIN_PLAYERS,
  applySetupDeltas,
  parseSetupModifier,
  randomizeBagSelection,
  type TeamCounts,
} from "@/lib/bagBuilder";

import { CharacterToken } from "./CharacterToken";
import styles from "./BagBuilder.module.css";

// Setup characters whose bracket text isn't a structured count delta, but
// which break the normal team distribution by design — their own ability
// text is shown prominently instead, and target-count validation relaxes
// entirely while any of them are selected.
const RELAXED_VALIDATION_IDS = new Set(["legion", "riot", "atheist", "summoner"]);

// Characters whose "+the X" requirement is fulfilled automatically rather
// than merely warned about (Huntsman brings its own Damsel; Choirboy just
// requires the King already be in the bag).
const AUTO_ADD_TARGET_ID: Record<string, string> = { huntsman: "damsel" };

const DRUNK_ID = "drunk";

const CORE_TEAMS: Team[] = [
  "townsfolk",
  "outsider",
  "minion",
  "demon",
  "traveller",
];

const TOWNSFOLK_BY_NAME = new Map(
  allCharacters
    .filter((c) => c.team === "townsfolk")
    .map((c) => [c.name.toLowerCase(), c] as const),
);

export interface BagBuilderProps {
  characters: Character[];
}

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function BagBuilder({ characters }: BagBuilderProps) {
  const [playerCount, setPlayerCount] = useState(MIN_PLAYERS);
  const [travellerCount, setTravellerCount] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [modifierChoices, setModifierChoices] = useState<
    Record<string, number>
  >({});
  const [extraCopies, setExtraCopies] = useState<Record<string, number>>({});
  const [standInId, setStandInId] = useState<string | null>(null);

  // The selectable pool is the script's characters plus anything a special
  // flow auto-adds (e.g. Huntsman pulling in the Damsel) that the script
  // didn't already include.
  const pool = useMemo(() => {
    const ids = new Set(characters.map((c) => c.id));
    const extras: Character[] = [];
    for (const [triggerId, targetId] of Object.entries(AUTO_ADD_TARGET_ID)) {
      if (selectedIds.has(triggerId) && !ids.has(targetId)) {
        const target = getCharacter(targetId);
        if (target) extras.push(target);
      }
    }
    return [...characters, ...extras];
  }, [characters, selectedIds]);

  const selectedCharacters = useMemo(
    () => pool.filter((c) => selectedIds.has(c.id)),
    [pool, selectedIds],
  );

  const parsedModifiers = useMemo(() => {
    const map = new Map<string, ReturnType<typeof parseSetupModifier>>();
    for (const character of pool) {
      map.set(character.id, parseSetupModifier(character.ability));
    }
    return map;
  }, [pool]);

  const deltas = selectedCharacters.flatMap((character) => {
    const parsed = parsedModifiers.get(character.id);
    if (!parsed || parsed.options.length === 0) return [];
    const chosen = modifierChoices[character.id] ?? 0;
    const option = parsed.options[chosen] ?? parsed.options[0];
    return [option];
  });

  const effectivePlayerCount = clamp(playerCount, MIN_PLAYERS, MAX_PLAYERS);
  const effectiveTravellerCount = clamp(travellerCount, 0, MAX_TRAVELLERS);
  const adjustedCounts: TeamCounts = applySetupDeltas(
    effectivePlayerCount,
    deltas,
  );
  const relaxValidation = selectedCharacters.some((c) =>
    RELAXED_VALIDATION_IDS.has(c.id),
  );
  const activeJinxes = computeActiveJinxes(selectedCharacters);

  const requirementWarnings = selectedCharacters.flatMap((character) => {
    const parsed = parsedModifiers.get(character.id);
    if (!parsed?.requiresCharacterName) return [];
    if (AUTO_ADD_TARGET_ID[character.id]) return [];
    const satisfied = selectedCharacters.some(
      (c) =>
        c.name.toLowerCase() === parsed.requiresCharacterName!.toLowerCase(),
    );
    return satisfied
      ? []
      : [`${character.name} needs ${parsed.requiresCharacterName} in the bag.`];
  });

  const relaxedCharacters = selectedCharacters.filter((c) =>
    RELAXED_VALIDATION_IDS.has(c.id),
  );

  function toggleCharacter(character: Character) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(character.id)) {
        next.delete(character.id);
        if (character.id === DRUNK_ID) setStandInId(null);
      } else {
        next.add(character.id);
        const autoAddId = AUTO_ADD_TARGET_ID[character.id];
        if (autoAddId) next.add(autoAddId);
      }
      return next;
    });
  }

  function targetFor(team: Team): number {
    if (team === "traveller") return effectiveTravellerCount;
    if (team === "townsfolk" || team === "outsider" || team === "minion" || team === "demon") {
      return adjustedCounts[team];
    }
    return selectedCharacters.filter((c) => c.team === team).length;
  }

  function handleRandomize() {
    const targets: Partial<Record<Team, number>> = {
      townsfolk: adjustedCounts.townsfolk,
      outsider: adjustedCounts.outsider,
      minion: adjustedCounts.minion,
      demon: adjustedCounts.demon,
      traveller: effectiveTravellerCount,
    };
    setSelectedIds((prev) => randomizeBagSelection(pool, targets, prev));
  }

  // The four official teams plus Travellers always get a counter row, even
  // when the script has no characters of that team — the target count
  // (from the distribution table or the traveller field) still applies.
  // Fabled/Loric have no target concept, so they only appear via
  // groupByTeam, and only when the pool actually has one.
  const coreGroups = CORE_TEAMS.map((team) => ({
    team,
    characters: pool.filter((c) => c.team === team),
  }));
  const extraGroups = groupByTeam(pool).filter(
    (g) => !CORE_TEAMS.includes(g.team),
  );
  const groups = [...coreGroups, ...extraGroups];
  const availableStandIns = Array.from(TOWNSFOLK_BY_NAME.values()).filter(
    (c) => !selectedIds.has(c.id),
  );

  return (
    <div className={styles.main}>
      <div className={styles.controls}>
        <label className={styles.field}>
          Player count
          <input
            type="number"
            min={MIN_PLAYERS}
            max={MAX_PLAYERS}
            value={playerCount}
            // Clamping is deferred to blur: clamping on every keystroke
            // fights the browser's in-progress digit-by-digit typing (e.g.
            // typing "13" would clamp the intermediate "1" to 5 first).
            onChange={(event) => setPlayerCount(Number(event.target.value))}
            onBlur={() =>
              setPlayerCount((value) => clamp(value, MIN_PLAYERS, MAX_PLAYERS))
            }
          />
        </label>
        <label className={styles.field}>
          Traveller count
          <input
            type="number"
            min={0}
            max={MAX_TRAVELLERS}
            value={travellerCount}
            onChange={(event) => setTravellerCount(Number(event.target.value))}
            onBlur={() =>
              setTravellerCount((value) => clamp(value, 0, MAX_TRAVELLERS))
            }
          />
        </label>
        <button
          type="button"
          className={styles.randomize}
          onClick={handleRandomize}
        >
          Randomize
        </button>
      </div>

      {relaxedCharacters.length > 0 && (
        <div className={styles.banner} role="status">
          {relaxedCharacters.map((character) => (
            <p key={character.id}>
              <span className={styles.bannerTitle}>{character.name}: </span>
              {character.ability}
            </p>
          ))}
          <p>Count validation is relaxed while these are in the bag.</p>
        </div>
      )}

      {requirementWarnings.length > 0 && (
        <div className={styles.warnings} role="alert">
          {requirementWarnings.map((warning) => (
            <p key={warning}>{warning}</p>
          ))}
        </div>
      )}

      {selectedIds.has(DRUNK_ID) && (
        <div className={styles.standIn}>
          <label htmlFor="stand-in-select">
            Pick the Drunk&apos;s stand-in (the Townsfolk the player believes
            they are)
          </label>
          <select
            id="stand-in-select"
            value={standInId ?? ""}
            onChange={(event) => setStandInId(event.target.value || null)}
          >
            <option value="">Choose a stand-in…</option>
            {availableStandIns.map((character) => (
              <option key={character.id} value={character.id}>
                {character.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {groups.map((group) => {
        const target = targetFor(group.team);
        const selectedCount = group.characters.filter((c) =>
          selectedIds.has(c.id),
        ).length;
        const showValidation =
          !relaxValidation &&
          (group.team === "townsfolk" ||
            group.team === "outsider" ||
            group.team === "minion" ||
            group.team === "demon");
        const state = !showValidation
          ? undefined
          : selectedCount < target
            ? "under"
            : selectedCount > target
              ? "over"
              : "met";

        return (
          <section key={group.team} className={styles.teamSection}>
            <div className={styles.teamHeading}>
              <h2 className={styles.teamName}>{teamNames[group.team]}</h2>
              <span className={styles.teamCount} data-state={state}>
                {teamNames[group.team]} {selectedCount}/{target}
              </span>
            </div>
            <ul className={styles.characters}>
              {group.characters.map((character) => {
                const isSelected = selectedIds.has(character.id);
                const parsed = parsedModifiers.get(character.id);
                const choiceOptions =
                  isSelected && parsed && parsed.options.length > 1
                    ? parsed.options
                    : null;
                const copiesRange =
                  isSelected && parsed?.extraCopies ? parsed.extraCopies : null;

                return (
                  <li key={character.id}>
                    <button
                      type="button"
                      className={styles.character}
                      aria-pressed={isSelected}
                      onClick={() => toggleCharacter(character)}
                    >
                      <CharacterToken character={character} />
                      <span className={styles.characterName}>
                        <span>
                          {character.name}
                          {character.setup && (
                            <span
                              className={styles.setupBadge}
                              aria-label="setup modifier"
                              title="Setup modifier"
                            >
                              {" "}
                              !
                            </span>
                          )}
                        </span>
                        {isSelected && parsed && (
                          <span className={styles.modifierText}>
                            [{parsed.bracketText}]
                          </span>
                        )}
                      </span>
                    </button>
                    {choiceOptions && (
                      <select
                        aria-label={`${character.name} setup choice`}
                        value={modifierChoices[character.id] ?? 0}
                        onChange={(event) =>
                          setModifierChoices((prev) => ({
                            ...prev,
                            [character.id]: Number(event.target.value),
                          }))
                        }
                      >
                        {choiceOptions.map((option, index) => (
                          <option key={option.label} value={index}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    )}
                    {copiesRange && (
                      <label>
                        Extra {character.name} copies
                        <input
                          type="number"
                          aria-label={`Extra ${character.name} copies`}
                          min={copiesRange.min}
                          max={copiesRange.max}
                          value={extraCopies[character.id] ?? 0}
                          onChange={(event) =>
                            setExtraCopies((prev) => ({
                              ...prev,
                              [character.id]: clamp(
                                Number(event.target.value),
                                copiesRange.min,
                                copiesRange.max,
                              ),
                            }))
                          }
                        />
                      </label>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}

      {activeJinxes.length > 0 && (
        <section className={styles.jinxes}>
          <h2 className={styles.teamName}>Jinxes</h2>
          <ul>
            {activeJinxes.map((jinx) => (
              <li key={`${jinx.characterId}-${jinx.targetId}`}>
                <p>
                  {getCharacter(jinx.characterId)?.name ?? jinx.characterId}
                  {" & "}
                  {getCharacter(jinx.targetId)?.name ?? jinx.targetId}
                </p>
                <p>{jinx.reason}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
