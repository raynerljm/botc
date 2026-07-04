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

  it("resolves a jinx name even when the target id's case/hyphenation differs from the character's own id", () => {
    const alchemist = getCharacter("alchemist")!;
    const wraith = getCharacter("wraith")!;

    render(
      <ScriptSheet
        meta={{}}
        characters={[alchemist, wraith]}
        jinxes={[
          {
            characterId: "Alchemist",
            targetId: "Wraith",
            reason: "test reason",
          },
        ]}
      />,
    );

    expect(screen.getByText("Alchemist & Wraith")).toBeInTheDocument();
  });

  it("does not render a javascript: almanac link, but renders a real http(s) one", () => {
    const { rerender } = render(
      <ScriptSheet
        meta={{ author: "Someone", almanac: "javascript:alert(1)" }}
        characters={[]}
        jinxes={[]}
      />,
    );
    expect(
      screen.queryByRole("link", { name: /almanac/i }),
    ).not.toBeInTheDocument();

    rerender(
      <ScriptSheet
        meta={{ author: "Someone", almanac: "https://example.com/almanac" }}
        characters={[]}
        jinxes={[]}
      />,
    );
    expect(screen.getByRole("link", { name: /almanac/i })).toHaveAttribute(
      "href",
      "https://example.com/almanac",
    );
  });
});
