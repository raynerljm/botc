import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { getCharacter, getEditionCharacters } from "@/lib/characters";

import { BagBuilder } from "./BagBuilder";

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
    // Default 5p targets: 3 Townsfolk / 0 Outsiders / 1 Minion / 1 Demon.
    expect(screen.getByText("Townsfolk 3/3")).toBeInTheDocument();
    expect(screen.getByText("Outsiders 0/0")).toBeInTheDocument();
    expect(screen.getByText("Minions 1/1")).toBeInTheDocument();
    expect(screen.getByText("Demons 1/1")).toBeInTheDocument();
  });
});
