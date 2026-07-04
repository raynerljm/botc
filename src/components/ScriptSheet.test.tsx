import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { getCharacter } from "@/lib/characters";
import { parseScript } from "@/lib/scriptParser";

import { ScriptSheet } from "./ScriptSheet";

describe("ScriptSheet", () => {
  it("links a reskinned official character to its real wiki page, not the local name", async () => {
    const result = parseScript(
      JSON.stringify([
        {
          id: "washerwoman",
          name: "Village Washerwoman",
          team: "townsfolk",
          ability: "You start knowing that 1 of 2 players is a particular Townsfolk.",
        },
      ]),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    render(
      <ScriptSheet
        meta={result.script.meta}
        characters={result.script.characters}
        jinxes={result.script.jinxes}
      />,
    );

    await userEvent
      .setup()
      .click(screen.getByText("Village Washerwoman", { selector: "summary *" }));

    const wikiLink = screen.getByRole("link", {
      name: /Washerwoman on the wiki/i,
    });
    expect(wikiLink).toHaveAttribute(
      "href",
      "https://wiki.bloodontheclocktower.com/Washerwoman",
    );
  });

  it("shows no wiki link for a character with no official record", async () => {
    const result = parseScript(
      JSON.stringify([
        {
          id: "custom-seer",
          name: "Custom Seer",
          team: "townsfolk",
          ability: "You start knowing nothing.",
        },
      ]),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(getCharacter("custom-seer")).toBeUndefined();

    render(
      <ScriptSheet
        meta={result.script.meta}
        characters={result.script.characters}
        jinxes={result.script.jinxes}
      />,
    );

    await userEvent
      .setup()
      .click(screen.getByText("Custom Seer", { selector: "summary *" }));

    expect(
      screen.queryByRole("link", { name: /on the wiki/i }),
    ).not.toBeInTheDocument();
  });
});
