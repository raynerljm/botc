import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getCharacter, getEditionCharacters } from "@/lib/characters";
import { createGame } from "@/lib/gameDocument";
import { clearGames, loadGame, saveGame } from "@/lib/gameStorage";

import { BagBuilder } from "./BagBuilder";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

const tb = getEditionCharacters("tb");

function characters(...ids: string[]) {
  return ids.map((id) => getCharacter(id)!);
}

describe("player count and official target counts", () => {
  it("shows the official targets for the default 5-player count before any selection", () => {
    render(<BagBuilder characters={tb} />);

    expect(screen.getByText("Townsfolk 0/3")).toBeInTheDocument();
    expect(screen.getByText("Outsiders 0/0")).toBeInTheDocument();
    expect(screen.getByText("Minions 0/1")).toBeInTheDocument();
    expect(screen.getByText("Demons 0/1")).toBeInTheDocument();
  });

  it("recomputes targets when the storyteller changes the player count", async () => {
    const user = userEvent.setup();
    render(<BagBuilder characters={tb} />);

    const playerCountInput = screen.getByLabelText("Player count");
    await user.clear(playerCountInput);
    await user.type(playerCountInput, "13");

    expect(screen.getByText("Townsfolk 0/9")).toBeInTheDocument();
    expect(screen.getByText("Outsiders 0/0")).toBeInTheDocument();
    expect(screen.getByText("Minions 0/3")).toBeInTheDocument();
    expect(screen.getByText("Demons 0/1")).toBeInTheDocument();
  });

  it("shows a traveller target driven by the separate 0-5 traveller count", async () => {
    const user = userEvent.setup();
    render(<BagBuilder characters={tb} />);

    expect(screen.getByText("Travellers 0/0")).toBeInTheDocument();

    const travellerCountInput = screen.getByLabelText("Traveller count");
    await user.clear(travellerCountInput);
    await user.type(travellerCountInput, "2");

    expect(screen.getByText("Travellers 0/2")).toBeInTheDocument();
  });

  it("doesn't crash on a fractional player count — it rounds instead", async () => {
    const user = userEvent.setup();
    render(<BagBuilder characters={tb} />);

    const playerCountInput = screen.getByLabelText("Player count");
    await user.clear(playerCountInput);
    await user.type(playerCountInput, "8.5");

    // Rounds to 9p (5 Townsfolk / 2 Outsiders / 1 Minion / 1 Demon) instead
    // of throwing on a player count the distribution table doesn't have.
    expect(screen.getByText("Townsfolk 0/5")).toBeInTheDocument();
    expect(screen.getByText("Outsiders 0/2")).toBeInTheDocument();
  });

  it("lets the player count field go blank while editing instead of snapping to 0", async () => {
    const user = userEvent.setup();
    render(<BagBuilder characters={tb} />);

    const playerCountInput = screen.getByLabelText("Player count");
    await user.clear(playerCountInput);

    expect(playerCountInput).toHaveValue(null);
  });
});

describe("character grid select/deselect with live counters", () => {
  it("groups the pool by team, in team order", () => {
    render(<BagBuilder characters={tb} />);

    const teamHeadings = screen
      .getAllByRole("heading", { level: 2 })
      .map((h) => h.textContent);
    expect(teamHeadings).toEqual([
      "Townsfolk",
      "Outsiders",
      "Minions",
      "Demons",
      "Travellers",
    ]);
  });

  it("selects a character on tap, bumping its team's counter", async () => {
    const user = userEvent.setup();
    render(<BagBuilder characters={tb} />);

    const washerwoman = screen.getByRole("button", { name: /Washerwoman/ });
    expect(washerwoman).toHaveAttribute("aria-pressed", "false");

    await user.click(washerwoman);

    expect(washerwoman).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Townsfolk 1/3")).toBeInTheDocument();
  });

  it("deselects a character back out, dropping its team's counter", async () => {
    const user = userEvent.setup();
    render(<BagBuilder characters={tb} />);

    const washerwoman = screen.getByRole("button", { name: /Washerwoman/ });
    await user.click(washerwoman);
    await user.click(washerwoman);

    expect(washerwoman).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("Townsfolk 0/3")).toBeInTheDocument();
  });

  it("marks a team's counter under target until enough are selected, then met", async () => {
    const user = userEvent.setup();
    render(<BagBuilder characters={tb} />);

    expect(screen.getByText("Demons 0/1")).toHaveAttribute(
      "data-state",
      "under",
    );

    await user.click(screen.getByRole("button", { name: /^Imp/ }));

    expect(screen.getByText("Demons 1/1")).toHaveAttribute(
      "data-state",
      "met",
    );
  });

  it("marks a team's counter over target once too many are selected", async () => {
    const user = userEvent.setup();
    render(<BagBuilder characters={tb} />);

    await user.click(screen.getByRole("button", { name: /^Imp/ }));
    // TB has exactly one Demon (Imp), so use Minions (target 1 at 5p) to
    // reach "over" by selecting a second one.
    await user.click(screen.getByRole("button", { name: /^Baron/ }));
    await user.click(screen.getByRole("button", { name: /^Poisoner/ }));

    expect(screen.getByText("Minions 2/1")).toHaveAttribute(
      "data-state",
      "over",
    );
  });
});

describe("generic setup-modifier adjustment (AC3)", () => {
  it("adjusts Outsider/Townsfolk targets and shows the modifier's explanation when Baron is selected", async () => {
    const user = userEvent.setup();
    render(<BagBuilder characters={tb} />);

    const playerCountInput = screen.getByLabelText("Player count");
    await user.clear(playerCountInput);
    await user.type(playerCountInput, "13");
    await user.tab();

    expect(screen.getByText("Townsfolk 0/9")).toBeInTheDocument();
    expect(screen.getByText("Outsiders 0/0")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^Baron/ }));

    // The issue's own reference scenario: 13p + Baron -> 7 TF / 2 Outsiders.
    expect(screen.getByText("Townsfolk 0/7")).toBeInTheDocument();
    expect(screen.getByText("Outsiders 0/2")).toBeInTheDocument();
    expect(screen.getByText("[+2 Outsiders]")).toBeInTheDocument();
  });

  it("flags a setup-modifier character with a visible indicator", () => {
    render(<BagBuilder characters={tb} />);

    const baron = screen.getByRole("button", { name: /^Baron/ });
    expect(baron).toHaveTextContent("!");
  });

  it("does not flag a non-setup character with the indicator", () => {
    render(<BagBuilder characters={tb} />);

    const washerwoman = screen.getByRole("button", { name: /^Washerwoman/ });
    expect(washerwoman).not.toHaveTextContent("!");
  });
});

describe("special flow: Godfather asks +1 or -1 Outsider (AC4)", () => {
  it("offers a storyteller choice between the Godfather's two deltas", async () => {
    const user = userEvent.setup();
    render(<BagBuilder characters={characters("godfather", "washerwoman")} />);

    await user.click(screen.getByRole("button", { name: /^Godfather/ }));
    const choice = screen.getByLabelText("Godfather setup choice");
    expect(choice).toHaveDisplayValue("-1 Outsider");

    // 5p base is 0 Outsiders/3 Townsfolk; -1 Outsider clamps oddly so use
    // the +1 option to see the swap the other way.
    await user.selectOptions(choice, "+1 Outsider");
    expect(screen.getByText("Outsiders 0/1")).toBeInTheDocument();
    expect(screen.getByText("Townsfolk 0/2")).toBeInTheDocument();
  });
});

describe("special flow: Drunk stand-in (AC4)", () => {
  it("prompts for a stand-in Townsfolk once the Drunk is selected", async () => {
    const user = userEvent.setup();
    render(<BagBuilder characters={characters("drunk", "washerwoman")} />);

    expect(
      screen.queryByLabelText(/Pick the Drunk's stand-in/),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^Drunk/ }));

    const standIn = screen.getByLabelText(/Pick the Drunk's stand-in/);
    await user.selectOptions(standIn, "Washerwoman");
    expect(standIn).toHaveDisplayValue("Washerwoman");
  });

  it("clears the stand-in prompt when the Drunk is deselected", async () => {
    const user = userEvent.setup();
    render(<BagBuilder characters={characters("drunk", "washerwoman")} />);

    const drunk = screen.getByRole("button", { name: /^Drunk/ });
    await user.click(drunk);
    await user.click(drunk);

    expect(
      screen.queryByLabelText(/Pick the Drunk's stand-in/),
    ).not.toBeInTheDocument();
  });

  it("only offers this script's own Townsfolk as stand-ins, not the whole dataset", async () => {
    const user = userEvent.setup();
    render(<BagBuilder characters={characters("drunk", "washerwoman")} />);

    await user.click(screen.getByRole("button", { name: /^Drunk/ }));

    const standIn = screen.getByLabelText(/Pick the Drunk's stand-in/);
    expect(
      within(standIn).getByRole("option", { name: "Washerwoman" }),
    ).toBeInTheDocument();
    // Professor is an official Townsfolk, but not part of this script.
    expect(
      within(standIn).queryByRole("option", { name: "Professor" }),
    ).not.toBeInTheDocument();
  });

  it("clears the chosen stand-in once that character is separately selected into the bag", async () => {
    const user = userEvent.setup();
    render(<BagBuilder characters={characters("drunk", "washerwoman")} />);

    await user.click(screen.getByRole("button", { name: /^Drunk/ }));
    const standIn = screen.getByLabelText(/Pick the Drunk's stand-in/);
    await user.selectOptions(standIn, "Washerwoman");
    expect(standIn).toHaveDisplayValue("Washerwoman");

    // Washerwoman is now claimed as the stand-in; selecting her for real
    // (a plain, unrestricted action) should give up that stand-in slot.
    await user.click(screen.getByRole("button", { name: /^Washerwoman/ }));

    expect(standIn).toHaveDisplayValue("Choose a stand-in…");
  });

  it("warns, but never blocks, when the Drunk has no stand-in picked yet (ADR 0003)", async () => {
    const user = userEvent.setup();
    render(
      <BagBuilder
        characters={characters("drunk", "washerwoman")}
        scriptId="tb"
        scriptName="Trouble Brewing"
      />,
    );

    await user.click(screen.getByRole("button", { name: /^Drunk/ }));

    expect(
      screen.getByText(/Drunk needs a stand-in/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Continue to seating/i }),
    ).not.toBeDisabled();

    await user.selectOptions(
      screen.getByLabelText(/Pick the Drunk's stand-in/),
      "Washerwoman",
    );

    expect(
      screen.queryByText(/Drunk needs a stand-in/i),
    ).not.toBeInTheDocument();
  });
});

describe("special flow: Huntsman auto-adds the Damsel (AC4)", () => {
  it("selects the Damsel automatically once the Huntsman is selected", async () => {
    const user = userEvent.setup();
    render(<BagBuilder characters={characters("huntsman")} />);

    expect(
      screen.queryByRole("button", { name: /^Damsel/ }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^Huntsman/ }));

    const damsel = screen.getByRole("button", { name: /^Damsel/ });
    expect(damsel).toHaveAttribute("aria-pressed", "true");
  });

  it("captures the auto-added Damsel in the game's script pool, not just the bag", async () => {
    const user = userEvent.setup();
    render(
      <BagBuilder
        characters={characters("huntsman")}
        scriptId="custom"
        scriptName="Custom"
      />,
    );

    await user.click(screen.getByRole("button", { name: /^Huntsman/ }));
    await user.click(
      screen.getByRole("button", { name: /Continue to seating/i }),
    );
    // Huntsman + Damsel alone don't fill the default 5p target counts —
    // override the mismatch warning, since this test is about the script
    // pool capture, not count validation.
    await user.click(
      screen.getByRole("button", { name: /Continue anyway/i }),
    );

    // Damsel never appeared in the script's own `characters` prop — she only
    // entered play via auto-add — but a real player can still draw her, so
    // she must be a valid claim/bluff option too.
    expect(loadGame()!.scriptCharacters.map((c) => c.id)).toContain("damsel");
  });

  it("removes the auto-added Damsel when the Huntsman is deselected", async () => {
    const user = userEvent.setup();
    render(<BagBuilder characters={characters("huntsman")} />);

    const huntsman = screen.getByRole("button", { name: /^Huntsman/ });
    await user.click(huntsman);
    expect(screen.getByRole("button", { name: /^Damsel/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await user.click(huntsman);

    expect(
      screen.queryByRole("button", { name: /^Damsel/ }),
    ).not.toBeInTheDocument();
  });

  it("warns again if the auto-added Damsel is manually deselected while the Huntsman stays selected", async () => {
    const user = userEvent.setup();
    render(<BagBuilder characters={characters("huntsman")} />);

    await user.click(screen.getByRole("button", { name: /^Huntsman/ }));
    expect(
      screen.queryByText("Huntsman needs Damsel in the bag."),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^Damsel/ }));

    expect(
      screen.getByText("Huntsman needs Damsel in the bag."),
    ).toBeInTheDocument();
  });

  it("brings the Damsel along when Randomize itself picks the Huntsman", async () => {
    // Huntsman is the only Townsfolk candidate here, so Randomize's
    // Townsfolk fill is guaranteed to pick it deterministically.
    const user = userEvent.setup();
    render(<BagBuilder characters={characters("huntsman")} />);

    await user.click(screen.getByRole("button", { name: /^Randomize/ }));

    expect(screen.getByRole("button", { name: /^Huntsman/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: /^Damsel/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(
      screen.queryByText("Huntsman needs Damsel in the bag."),
    ).not.toBeInTheDocument();
  });
});

describe("special flow: Choirboy requires the King (AC4)", () => {
  it("warns when the Choirboy is selected without the King, without blocking anything", async () => {
    const user = userEvent.setup();
    render(<BagBuilder characters={characters("choirboy", "king")} />);

    await user.click(screen.getByRole("button", { name: /^Choirboy/ }));
    expect(
      screen.getByText("Choirboy needs King in the bag."),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^King/ }));
    expect(
      screen.queryByText("Choirboy needs King in the bag."),
    ).not.toBeInTheDocument();
  });
});

describe("special flow: Village Idiot extra copies (AC4)", () => {
  it("offers a 0-2 extra-copies stepper once selected", async () => {
    const user = userEvent.setup();
    render(<BagBuilder characters={characters("villageidiot")} />);

    expect(
      screen.queryByLabelText("Extra Village Idiot copies"),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^Village Idiot/ }));

    const stepper = screen.getByLabelText("Extra Village Idiot copies");
    expect(stepper).toHaveAttribute("min", "0");
    expect(stepper).toHaveAttribute("max", "2");
  });
});

describe("special flow: Legion/Riot/Atheist/Summoner relax validation (AC4)", () => {
  it("shows Legion's ability prominently and relaxes team-count validation", async () => {
    const user = userEvent.setup();
    render(<BagBuilder characters={characters("legion", "washerwoman")} />);

    expect(
      screen.getByText("Demons 0/1", { exact: false }),
    ).toHaveAttribute("data-state", "under");

    await user.click(screen.getByRole("button", { name: /^Legion/ }));

    expect(screen.getByRole("status")).toHaveTextContent(
      /Each night\*, a player might die/,
    );
    // Legion is a Demon itself, so the team is now met — but assert the
    // *other* teams (Townsfolk) no longer carry a validation state either.
    const townsfolkCounter = screen.getByText(/^Townsfolk \d+\/\d+$/);
    expect(townsfolkCounter).not.toHaveAttribute("data-state");
  });

  it("also relaxes validation for a freeform setup character not on the hardcoded list (Xaan)", async () => {
    // Xaan's "[X Outsiders]" bracket can't resolve to a fixed delta, the
    // same shape as Legion/Atheist/Summoner's brackets — it should relax
    // validation for the same reason, without needing its id hardcoded too.
    const user = userEvent.setup();
    render(<BagBuilder characters={characters("xaan", "washerwoman")} />);

    await user.click(screen.getByRole("button", { name: /^Xaan/ }));

    expect(screen.getByRole("status")).toHaveTextContent(/On night X/);
    const townsfolkCounter = screen.getByText(/^Townsfolk \d+\/\d+$/);
    expect(townsfolkCounter).not.toHaveAttribute("data-state");
  });
});

describe("active jinxes among selected characters (AC5)", () => {
  it("surfaces a jinx only once both jinxed characters are selected", async () => {
    const user = userEvent.setup();
    render(<BagBuilder characters={characters("alchemist", "spy")} />);

    expect(screen.queryByText("Alchemist & Spy")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^Alchemist/ }));
    expect(screen.queryByText("Alchemist & Spy")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^Spy/ }));
    expect(screen.getByText("Alchemist & Spy")).toBeInTheDocument();
    expect(
      screen.getByText(/do not, and a Spy is in play/),
    ).toBeInTheDocument();
  });
});

describe("warnings are advisory, never blocking (AC6)", () => {
  it("keeps every character toggle enabled no matter how far the bag deviates from target", async () => {
    const user = userEvent.setup();
    render(<BagBuilder characters={tb} />);

    // Wildly over-select Minions at the default 5p (target 1) count.
    await user.click(screen.getByRole("button", { name: /^Baron/ }));
    await user.click(screen.getByRole("button", { name: /^Poisoner/ }));
    await user.click(screen.getByRole("button", { name: /^Spy/ }));
    await user.click(screen.getByRole("button", { name: /^Scarlet Woman/ }));

    expect(screen.getByText("Minions 4/1")).toHaveAttribute(
      "data-state",
      "over",
    );
    for (const button of screen.getAllByRole("button")) {
      expect(button).not.toBeDisabled();
    }
  });
});

describe("randomize fills remaining slots to the adjusted targets (AC7)", () => {
  it("tops every team up to target while leaving existing selections alone", async () => {
    const user = userEvent.setup();
    render(<BagBuilder characters={tb} />);

    await user.click(screen.getByRole("button", { name: /^Washerwoman/ }));
    await user.click(screen.getByRole("button", { name: /^Randomize/ }));

    expect(screen.getByRole("button", { name: /^Washerwoman/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    // Whichever Minion Randomize happens to pick could itself be a setup
    // modifier (TB's Baron carries "+2 Outsiders"), which legitimately
    // shifts the Outsider/Townsfolk targets — so this asserts the actual
    // guarantee (every official team reaches its own target) rather than
    // hardcoding the un-adjusted 5p numbers, which only Baron-free runs
    // would satisfy.
    for (const label of ["Townsfolk", "Outsiders", "Minions", "Demons"]) {
      const counter = screen.getByText(new RegExp(`^${label} \\d+/\\d+$`));
      expect(counter).toHaveAttribute("data-state", "met");
    }
  });

  it("still reaches every target when the random fill picks a setup-modifier character", async () => {
    // Force Baron ("+2 Outsiders") into the bag before randomizing, so this
    // run deterministically exercises the case the test above only hits
    // sometimes: a shrunk Townsfolk target and a grown Outsider target.
    const user = userEvent.setup();
    render(<BagBuilder characters={tb} />);

    await user.click(screen.getByRole("button", { name: /^Baron/ }));
    await user.click(screen.getByRole("button", { name: /^Randomize/ }));

    // 5p base is 3 Townsfolk/0 Outsiders/1 Minion/1 Demon; Baron's
    // +2 Outsiders comes out of Townsfolk, so the adjusted targets are
    // 1 Townsfolk / 2 Outsiders / 1 Minion / 1 Demon.
    expect(screen.getByText("Townsfolk 1/1")).toBeInTheDocument();
    expect(screen.getByText("Outsiders 2/2")).toBeInTheDocument();
    expect(screen.getByText("Minions 1/1")).toBeInTheDocument();
    expect(screen.getByText("Demons 1/1")).toBeInTheDocument();
  });
});

describe("warns on a bag/script count mismatch before continuing (issue #51)", () => {
  beforeEach(() => {
    clearGames();
    push.mockClear();
  });

  it("shows a warning dialog naming the mismatched team and by how much, instead of continuing straight away", async () => {
    const user = userEvent.setup();
    render(
      <BagBuilder characters={tb} scriptId="tb" scriptName="Trouble Brewing" />,
    );

    // Default 5p target is Townsfolk 3/Outsider 0/Minion 1/Demon 1; selecting
    // only the Imp leaves Townsfolk and Minion under target.
    await user.click(screen.getByRole("button", { name: /^Imp/ }));
    await user.click(
      screen.getByRole("button", { name: /Continue to seating/i }),
    );

    const dialog = screen.getByRole("alertdialog", { name: /count/i });
    expect(dialog).toHaveTextContent(/Townsfolk.*3 under/i);
    expect(dialog).toHaveTextContent(/Minions.*1 under/i);
    // No navigation has happened yet — the mismatch is only a warning so far.
    expect(push).not.toHaveBeenCalled();
  });

  it("lets the storyteller dismiss the warning and stay on the bag builder, with no game created", async () => {
    const user = userEvent.setup();
    render(
      <BagBuilder characters={tb} scriptId="tb" scriptName="Trouble Brewing" />,
    );

    await user.click(screen.getByRole("button", { name: /^Imp/ }));
    await user.click(
      screen.getByRole("button", { name: /Continue to seating/i }),
    );
    await user.click(screen.getByRole("button", { name: /Go back/i }));

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(loadGame()).toBeNull();
    expect(push).not.toHaveBeenCalled();
  });

  it("skips the warning and continues straight away once every team's count matches its target", async () => {
    const user = userEvent.setup();
    render(
      <BagBuilder characters={tb} scriptId="tb" scriptName="Trouble Brewing" />,
    );

    // Default 5p target: Townsfolk 3/Outsider 0/Minion 1/Demon 1.
    await user.click(screen.getByRole("button", { name: /^Washerwoman/ }));
    await user.click(screen.getByRole("button", { name: /^Librarian/ }));
    await user.click(screen.getByRole("button", { name: /^Investigator/ }));
    await user.click(screen.getByRole("button", { name: /^Poisoner/ }));
    await user.click(screen.getByRole("button", { name: /^Imp/ }));
    await user.click(
      screen.getByRole("button", { name: /Continue to seating/i }),
    );

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(loadGame()).not.toBeNull();
    expect(push).toHaveBeenCalledWith("/game");
  });

  it("shows no warning when a relaxed-validation character is in the bag, even with mismatched raw counts", async () => {
    const user = userEvent.setup();
    render(
      <BagBuilder
        characters={characters("legion", "washerwoman")}
        scriptId="custom"
        scriptName="Custom"
      />,
    );

    // Legion alone leaves Townsfolk/Outsider/Minion all under target, but
    // count validation relaxes entirely while it's selected.
    await user.click(screen.getByRole("button", { name: /^Legion/ }));
    await user.click(
      screen.getByRole("button", { name: /Continue to seating/i }),
    );

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(loadGame()).not.toBeNull();
    expect(push).toHaveBeenCalledWith("/game");
  });

  it("moves focus into the dialog when it opens, traps Tab within it, and restores focus on dismiss", async () => {
    const user = userEvent.setup();
    render(
      <BagBuilder characters={tb} scriptId="tb" scriptName="Trouble Brewing" />,
    );

    await user.click(screen.getByRole("button", { name: /^Imp/ }));
    const continueButton = screen.getByRole("button", {
      name: /Continue to seating/i,
    });
    await user.click(continueButton);

    const dialog = screen.getByRole("alertdialog", { name: /count/i });
    const goBack = within(dialog).getByRole("button", { name: /Go back/i });
    const continueAnyway = within(dialog).getByRole("button", {
      name: /Continue anyway/i,
    });
    // Opening moves focus inside the dialog rather than leaving it on the
    // trigger, so a keyboard user starts able to act on the warning itself.
    expect(dialog).toContainElement(document.activeElement as HTMLElement);

    // Tab cycles only between the dialog's own controls — it never escapes
    // to a covered background element (e.g. a character toggle) while the
    // dialog is open.
    await user.tab();
    expect(document.activeElement).toBe(continueAnyway);
    await user.tab();
    expect(document.activeElement).toBe(goBack);

    await user.click(goBack);

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(document.activeElement).toBe(continueButton);
  });
});

describe("continue to seating hands off into a new game (issue #12)", () => {
  beforeEach(() => {
    clearGames();
    push.mockClear();
  });

  it("has no continue action when the page hasn't identified the script", () => {
    render(<BagBuilder characters={tb} />);

    expect(
      screen.queryByRole("button", { name: /Continue to seating/i }),
    ).not.toBeInTheDocument();
  });

  it("creates and saves a game from the current bag, then navigates to it", async () => {
    const user = userEvent.setup();
    render(
      <BagBuilder characters={tb} scriptId="tb" scriptName="Trouble Brewing" />,
    );

    await user.click(screen.getByRole("button", { name: /^Washerwoman/ }));
    await user.click(screen.getByRole("button", { name: /^Imp/ }));
    await user.click(
      screen.getByRole("button", { name: /Continue to seating/i }),
    );
    // Washerwoman + Imp alone don't fill the default 5p target counts —
    // override the mismatch warning, since this test is about the hand-off
    // itself, not count validation.
    await user.click(
      screen.getByRole("button", { name: /Continue anyway/i }),
    );

    const game = loadGame();
    expect(game).not.toBeNull();
    expect(game!.scriptId).toBe("tb");
    expect(game!.scriptName).toBe("Trouble Brewing");
    expect(game!.players).toHaveLength(5);
    expect(game!.bag.map((t) => t.characterId).sort()).toEqual([
      "imp",
      "washerwoman",
    ]);
    expect(push).toHaveBeenCalledWith("/game");
    // The full script pool is captured too, not just what made the bag — a
    // Townsfolk left unselected (e.g. the Chef) still needs to be offerable
    // as a not-in-play Demon bluff later.
    expect(game!.scriptCharacters.map((c) => c.id)).toContain("chef");
  });

  it("is always available, even far from the target counts (ADR 0003)", () => {
    render(
      <BagBuilder characters={tb} scriptId="tb" scriptName="Trouble Brewing" />,
    );

    expect(
      screen.getByRole("button", { name: /Continue to seating/i }),
    ).not.toBeDisabled();
  });

  it("confirms before starting another game while one is in progress", async () => {
    const user = userEvent.setup();
    saveGame(
      createGame({
        scriptId: "tb",
        scriptName: "Existing game",
        playerCount: 5,
        selectedCharacters: [getCharacter("imp")!],
        standIn: null,
        extraCopies: {},
      }),
    );

    render(
      <BagBuilder characters={tb} scriptId="tb" scriptName="Trouble Brewing" />,
    );
    await user.click(
      screen.getByRole("button", { name: /Continue to seating/i }),
    );
    // No characters are selected, so this also trips the count-mismatch
    // warning first — override it to reach the in-progress-game confirm.
    await user.click(
      screen.getByRole("button", { name: /Continue anyway/i }),
    );

    const warning = screen.getByRole("alertdialog", {
      name: /already in progress/i,
    });
    await user.click(
      within(warning).getByRole("button", { name: /cancel/i }),
    );

    // Cancelled: no new game, no navigation, the existing game is untouched.
    expect(loadGame()?.scriptName).toBe("Existing game");
    expect(push).not.toHaveBeenCalled();

    await user.click(
      screen.getByRole("button", { name: /Continue to seating/i }),
    );
    await user.click(
      screen.getByRole("button", { name: /Continue anyway/i }),
    );
    await user.click(
      screen.getByRole("button", { name: /Start new game/i }),
    );

    expect(loadGame()?.scriptName).toBe("Trouble Brewing");
    expect(push).toHaveBeenCalledWith("/game");
  });
});
