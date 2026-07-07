"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import {
  getCharacter,
  groupByTeam,
  teamNames,
  type Character,
  type Team,
} from "@/lib/characters";
import {
  clearBagBuilderDraft,
  loadBagBuilderDraft,
  saveBagBuilderDraft,
  type BagBuilderDraft,
} from "@/lib/bagBuilderDraft";
import { createGame, isGameEnded } from "@/lib/gameDocument";
import { listGames, saveGame } from "@/lib/gameStorage";
import { computeActiveJinxes, normalizeCharacterId } from "@/lib/scriptParser";
import {
  MAX_PLAYERS,
  MAX_TRAVELLERS,
  MIN_PLAYERS,
  TEENSYVILLE_MAX_PLAYERS,
  applySetupDeltas,
  parseSetupModifier,
  randomizeBagSelection,
  type ParsedSetupModifier,
  type SetupModifierOption,
  type TeamCounts,
} from "@/lib/bagBuilder";

import { CharacterToken } from "./CharacterToken";
import { ConfirmDialog } from "./ConfirmDialog";
import styles from "./BagBuilder.module.css";

// Setup characters whose bracket text isn't a structured count delta, but
// which break the normal team distribution by design — their own ability
// text is shown prominently instead, and target-count validation relaxes
// entirely while any of them are selected. Riot has no bracket at all (its
// ability text never mentions a count), so it can't be derived from a
// parsed modifier the way Legion/Atheist/Summoner (and any other freeform
// setup character, e.g. Xaan/Kazali/Lord of Typhon) can — see
// isRelaxedCharacter below.
const RELAXED_VALIDATION_IDS = new Set(["legion", "riot", "atheist", "summoner"]);

// Characters whose "+the X" requirement is fulfilled automatically rather
// than merely warned about (Huntsman brings its own Damsel; Choirboy just
// requires the King already be in the bag).
const AUTO_ADD_TARGET_ID: Record<string, string> = { huntsman: "damsel" };

// Expands a selection with every auto-add target whose trigger is present —
// shared by a direct toggle and by Randomize, so a trigger ending up in the
// bag always brings its target along regardless of how it got selected.
function applyAutoAdds(ids: Set<string>): Set<string> {
  let next = ids;
  for (const [triggerId, targetId] of Object.entries(AUTO_ADD_TARGET_ID)) {
    if (next.has(triggerId) && !next.has(targetId)) {
      if (next === ids) next = new Set(ids);
      next.add(targetId);
    }
  }
  return next;
}

const DRUNK_ID = "drunk";

const OFFICIAL_TEAMS = new Set<Team>([
  "townsfolk",
  "outsider",
  "minion",
  "demon",
]);

function isOfficialTeam(team: Team): boolean {
  return OFFICIAL_TEAMS.has(team);
}

const CORE_TEAMS: Team[] = [
  "townsfolk",
  "outsider",
  "minion",
  "demon",
  "traveller",
];

// Filling a team can itself pick a setup-modifier character (e.g. a Demon
// like Lil' Monsta with "+1 Minion", or a Minion like Baron with "+2
// Outsiders"), which changes another team's target — and Townsfolk is
// always a derived remainder of the other three. So Randomize fills one
// team at a time in dependency order (Demon, whose target never itself
// changes → Minion, which a Demon's delta can grow → Outsider, which a
// Demon's or Minion's delta can grow or shrink → Townsfolk last, once
// every delta that could apply has already been locked in), recomputing
// targets before each team's fill so the final selection always matches
// its own targets instead of being over-filled by a target that shrank
// after the fact.
const RANDOMIZE_FILL_ORDER: Team[] = [
  "demon",
  "minion",
  "outsider",
  "traveller",
  "townsfolk",
];

// A character relaxes count validation either by name (Riot, whose ability
// has no bracket to parse) or because its bracket text didn't resolve to a
// structured delta (Legion/Atheist/Summoner and any future character with
// the same "breaks the normal distribution" shape, official or homebrew).
function isRelaxedCharacter(
  character: Character,
  parsed: ParsedSetupModifier | null | undefined,
): boolean {
  return RELAXED_VALIDATION_IDS.has(character.id) || parsed?.isFreeform === true;
}

export interface BagBuilderProps {
  characters: Character[];
  scriptId?: string;
  scriptName?: string;
  almanacUrl?: string;
  firstNightOrder?: string[];
  otherNightOrder?: string[];
  isTeensyville?: boolean;
}

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function omitKey(
  record: Record<string, number>,
  key: string,
): Record<string, number> {
  const next = { ...record };
  delete next[key];
  return next;
}

export function BagBuilder({
  characters,
  scriptId,
  scriptName,
  almanacUrl,
  firstNightOrder,
  otherNightOrder,
  isTeensyville = false,
}: BagBuilderProps) {
  const router = useRouter();
  const maxPlayers = isTeensyville ? TEENSYVILLE_MAX_PLAYERS : MAX_PLAYERS;
  // Loaded once on mount (not re-read on every render) — a reload or a
  // browser-back from `/game/` remounts this component fresh, so the lazy
  // initializers below are exactly when this needs to run (issue #118).
  const [initialDraft] = useState<BagBuilderDraft | null>(() =>
    scriptId ? loadBagBuilderDraft(scriptId) : null,
  );
  const [playerCount, setPlayerCount] = useState<number | "">(
    initialDraft?.playerCount ?? MIN_PLAYERS,
  );
  const [travellerCount, setTravellerCount] = useState<number | "">(
    initialDraft?.travellerCount ?? 0,
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    new Set(initialDraft?.selectedIds ?? []),
  );
  const [modifierChoices, setModifierChoices] = useState<
    Record<string, number>
  >(initialDraft?.modifierChoices ?? {});
  const [extraCopies, setExtraCopies] = useState<Record<string, number>>(
    initialDraft?.extraCopies ?? {},
  );
  const [standInId, setStandInId] = useState<string | null>(
    initialDraft?.standInId ?? null,
  );
  const [showCountWarning, setShowCountWarning] = useState(false);
  const [showInProgressWarning, setShowInProgressWarning] = useState(false);

  // Every field a storyteller can set while building the bag survives a
  // reload or a browser-back from `/game/` (issue #118) — persisted as one
  // draft per script rather than tied to any one GameDocument, since no
  // game exists yet at this point.
  useEffect(() => {
    if (!scriptId) return;
    saveBagBuilderDraft(scriptId, {
      playerCount,
      travellerCount,
      selectedIds: Array.from(selectedIds),
      modifierChoices,
      extraCopies,
      standInId,
    });
  }, [
    scriptId,
    playerCount,
    travellerCount,
    selectedIds,
    modifierChoices,
    extraCopies,
    standInId,
  ]);

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

  const poolById = useMemo(
    () => new Map(pool.map((c) => [c.id, c] as const)),
    [pool],
  );

  const selectedCharacters = useMemo(
    () => pool.filter((c) => selectedIds.has(c.id)),
    [pool, selectedIds],
  );

  const parsedModifiers = useMemo(() => {
    const map = new Map<string, ParsedSetupModifier | null>();
    for (const character of pool) {
      map.set(character.id, parseSetupModifier(character.ability));
    }
    return map;
  }, [pool]);

  // Shared by the render-time counters and by Randomize, which re-derives
  // this for each hypothetical selection it tries as it fills the bag (a
  // newly-picked setup character can itself change the targets mid-fill).
  function adjustedCountsFor(ids: Set<string>): TeamCounts {
    const chosenDeltas: Pick<
      SetupModifierOption,
      "outsiderDelta" | "minionDelta"
    >[] = [];
    for (const character of pool) {
      if (!ids.has(character.id)) continue;
      const parsed = parsedModifiers.get(character.id);
      if (!parsed || parsed.options.length === 0) continue;
      const chosen = modifierChoices[character.id] ?? 0;
      chosenDeltas.push(parsed.options[chosen] ?? parsed.options[0]);
    }
    return applySetupDeltas(effectivePlayerCount, chosenDeltas);
  }

  const effectivePlayerCount = clamp(
    playerCount === "" ? NaN : playerCount,
    MIN_PLAYERS,
    maxPlayers,
  );
  const effectiveTravellerCount = clamp(
    travellerCount === "" ? NaN : travellerCount,
    0,
    MAX_TRAVELLERS,
  );
  const adjustedCounts: TeamCounts = adjustedCountsFor(selectedIds);

  const relaxedCharacters = selectedCharacters.filter((c) =>
    isRelaxedCharacter(c, parsedModifiers.get(c.id)),
  );
  const relaxValidation = relaxedCharacters.length > 0;
  const activeJinxes = computeActiveJinxes(selectedCharacters);

  const requirementWarnings = selectedCharacters.flatMap((character) => {
    const parsed = parsedModifiers.get(character.id);
    if (!parsed?.requiresCharacterName) return [];
    const satisfied = selectedCharacters.some(
      (c) =>
        c.name.toLowerCase() === parsed.requiresCharacterName!.toLowerCase(),
    );
    return satisfied
      ? []
      : [`${character.name} needs ${parsed.requiresCharacterName} in the bag.`];
  });
  // Without a stand-in, the Drunk's slot produces no physical token at all
  // (buildBagTokens skips it), leaving one seat permanently unfillable.
  if (selectedIds.has(DRUNK_ID) && !standInId) {
    requirementWarnings.push(
      "The Drunk needs a stand-in Townsfolk picked before its seat can be filled.",
    );
  }

  function toggleCharacter(character: Character) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const autoAddId = AUTO_ADD_TARGET_ID[normalizeCharacterId(character.id)];
      if (next.has(character.id)) {
        next.delete(character.id);
        if (autoAddId) next.delete(autoAddId);
        return next;
      }
      next.add(character.id);
      return applyAutoAdds(next);
    });
    // A modifier choice or extra-copies count only makes sense for the
    // selection it was made under — clear it so re-selecting the character
    // later starts from its default rather than a stale prior choice.
    setModifierChoices((prev) =>
      character.id in prev ? omitKey(prev, character.id) : prev,
    );
    setExtraCopies((prev) =>
      character.id in prev ? omitKey(prev, character.id) : prev,
    );
    if (normalizeCharacterId(character.id) === DRUNK_ID) {
      setStandInId(null);
    } else if (character.id === standInId) {
      // The only way to toggle the exact character currently chosen as the
      // stand-in is to select them for real (availableStandIns excludes
      // whichever character already holds that role) — that claims their
      // token, so they can no longer also stand in for the Drunk.
      setStandInId(null);
    }
  }

  function targetFor(team: Team): number {
    if (team === "traveller") return effectiveTravellerCount;
    if (isOfficialTeam(team)) {
      return adjustedCounts[team as keyof TeamCounts];
    }
    return selectedCharacters.filter((c) => c.team === team).length;
  }

  function handleRandomize() {
    let current = selectedIds;
    for (const team of RANDOMIZE_FILL_ORDER) {
      const target =
        team === "traveller"
          ? effectiveTravellerCount
          : adjustedCountsFor(current)[team as keyof TeamCounts];
      current = randomizeBagSelection(pool, { [team]: target }, current);
    }
    // Randomize can pick a trigger character (e.g. Huntsman) the same as a
    // direct toggle can — bring its auto-add target along either way.
    current = applyAutoAdds(current);
    setSelectedIds(current);
    // Randomize can independently claim the character currently chosen as
    // the Drunk's stand-in for a real team slot, same as a direct toggle.
    if (standInId && current.has(standInId)) setStandInId(null);
  }

  function handleContinue() {
    if (!scriptId || !scriptName) return;
    // Advisory, never blocking (ADR 0003): a mismatch just interrupts once
    // with a dialog the storyteller can override.
    if (countMismatches.length > 0) {
      setShowCountWarning(true);
      return;
    }
    proceedToGame();
  }

  function proceedToGame() {
    if (!scriptId || !scriptName) return;
    setShowCountWarning(false);
    // Starting a new game is non-destructive now that many games coexist, but
    // an in-progress game is easy to lose track of — confirm before adding
    // another (advisory, ADR 0003: the storyteller can always proceed).
    const inProgress = listGames().some((g) => !isGameEnded(g));
    if (inProgress) {
      setShowInProgressWarning(true);
      return;
    }
    createAndEnterGame();
  }

  function createAndEnterGame() {
    if (!scriptId || !scriptName) return;
    setShowInProgressWarning(false);
    const game = createGame({
      scriptId,
      scriptName,
      playerCount: effectivePlayerCount,
      selectedCharacters,
      standIn: standInId ? (poolById.get(standInId) ?? null) : null,
      extraCopies,
      almanacUrl,
      firstNightOrder,
      otherNightOrder,
      // `pool`, not the raw `characters` prop — a character pulled in by
      // auto-add (e.g. Huntsman's Damsel) is genuinely in play and must be
      // offerable as a claim/bluff option too.
      scriptCharacters: pool,
    });
    saveGame(game);
    // The draft's job ends the moment it becomes a real game — otherwise a
    // *later*, unrelated build for the same script would silently inherit
    // this finished game's player count and selections instead of starting
    // from the ordinary defaults (code review finding). A reload or
    // browser-back *before* this point still restores the in-progress
    // draft (issue #118 AC3); this only clears it once it's no longer "in
    // progress" but an actual saved game.
    clearBagBuilderDraft(scriptId);
    router.push("/game");
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
  // Scoped to this script's own pool — a Townsfolk not on this script has
  // no physical token here, so it can't stand in for the Drunk.
  const availableStandIns = pool.filter(
    (c) => c.team === "townsfolk" && !selectedIds.has(c.id),
  );
  // Each extra copy of a character like Village Idiot is a physical
  // Townsfolk-styled token beyond the one already counted for that
  // character's own selection. The Drunk's stand-in is *not* one of
  // these: it's the same physical token as the Drunk's own Outsider slot,
  // just dressed as a Townsfolk, so counting it here too would tally that
  // one seat twice (issue #76).
  const extraTownsfolkTokens = Object.entries(extraCopies).reduce(
    (sum, [id, count]) => (selectedIds.has(id) ? sum + count : sum),
    0,
  );

  // The single source of truth for each official team's selected/target
  // counts — the per-team counter rows below and the Continue mismatch
  // warning both read from this instead of each re-deriving their own copy.
  const officialTeamCounts: { team: Team; selected: number; target: number }[] =
    CORE_TEAMS.filter(isOfficialTeam).map((team) => ({
      team,
      selected:
        selectedCharacters.filter((c) => c.team === team).length +
        (team === "townsfolk" ? extraTownsfolkTokens : 0),
      target: targetFor(team),
    }));
  const officialTeamCountsByTeam = new Map(
    officialTeamCounts.map((counts) => [counts.team, counts] as const),
  );
  // Suppressed the same way the per-team counters are by a
  // relaxed-validation script — surfaced here too so Continue can warn on
  // any mismatch before handing off to a game.
  const countMismatches = relaxValidation
    ? []
    : officialTeamCounts.filter(({ selected, target }) => selected !== target);

  return (
    <div className={styles.main}>
      <div className={styles.controls}>
        <label className={styles.field}>
          Player count
          <input
            type="number"
            min={MIN_PLAYERS}
            max={maxPlayers}
            value={playerCount}
            // Clamping is deferred to blur: clamping on every keystroke
            // fights the browser's in-progress digit-by-digit typing (e.g.
            // typing "13" would clamp the intermediate "1" to 5 first), and
            // an empty string is kept as-is so the field can actually be
            // blanked mid-edit instead of snapping to 0.
            onChange={(event) => {
              const raw = event.target.value;
              setPlayerCount(raw === "" ? "" : Number(raw));
            }}
            onBlur={() =>
              setPlayerCount((value) =>
                clamp(value === "" ? NaN : value, MIN_PLAYERS, maxPlayers),
              )
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
            onChange={(event) => {
              const raw = event.target.value;
              setTravellerCount(raw === "" ? "" : Number(raw));
            }}
            onBlur={() =>
              setTravellerCount((value) =>
                clamp(value === "" ? NaN : value, 0, MAX_TRAVELLERS),
              )
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
        {scriptId && scriptName && (
          <button
            type="button"
            className={styles.continue}
            onClick={handleContinue}
          >
            Continue to seating →
          </button>
        )}
      </div>

      {showCountWarning && (
        <ConfirmDialog
          title="Bag counts don't match the script"
          confirmLabel="Continue anyway"
          cancelLabel="Go back"
          onConfirm={proceedToGame}
          onCancel={() => setShowCountWarning(false)}
        >
          <ul>
            {countMismatches.map(({ team, selected, target }) => (
              <li key={team}>
                {teamNames[team]}: {selected}/{target} (
                {selected > target
                  ? `${selected - target} over`
                  : `${target - selected} under`}
                )
              </li>
            ))}
          </ul>
        </ConfirmDialog>
      )}

      {showInProgressWarning && (
        <ConfirmDialog
          title="Game already in progress"
          message="You already have a game in progress. Start a new game as well? Your existing game stays saved."
          confirmLabel="Start new game"
          onConfirm={createAndEnterGame}
          onCancel={() => setShowInProgressWarning(false)}
        />
      )}

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
        const official = officialTeamCountsByTeam.get(group.team);
        const target = official
          ? official.target
          : targetFor(group.team);
        const selectedCount = official
          ? official.selected
          : group.characters.filter((c) => selectedIds.has(c.id)).length;
        const showValidation = !relaxValidation && isOfficialTeam(group.team);
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

                const isStandIn = character.id === standInId;

                return (
                  <li key={character.id}>
                    <button
                      type="button"
                      className={styles.character}
                      aria-pressed={isSelected}
                      data-standin={isStandIn || undefined}
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
                        {isStandIn && (
                          <span className={styles.standInBadge}>
                            Drunk&apos;s stand-in
                          </span>
                        )}
                      </span>
                    </button>
                    {choiceOptions && (
                      <select
                        className={styles.select}
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
                  {poolById.get(jinx.characterId)?.name ?? jinx.characterId}
                  {" & "}
                  {poolById.get(jinx.targetId)?.name ?? jinx.targetId}
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
