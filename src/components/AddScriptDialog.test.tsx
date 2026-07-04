import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { listCustomScripts } from "@/lib/customScripts";

import { AddScriptDialog } from "./AddScriptDialog";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

describe("AddScriptDialog", () => {
  beforeEach(() => {
    window.localStorage.clear();
    push.mockClear();
  });

  it("saves a pasted script and navigates to it", async () => {
    const onAdded = vi.fn();
    render(<AddScriptDialog onAdded={onAdded} />);
    const user = userEvent.setup();

    await user.click(screen.getByText("Add a script"));
    fireEvent.change(screen.getByLabelText(/paste script-tool JSON/i), {
      target: { value: '["washerwoman", "imp"]' },
    });
    await user.click(screen.getByRole("button", { name: "Add script" }));

    const stored = listCustomScripts();
    expect(stored).toHaveLength(1);
    expect(stored[0].rawText).toBe('["washerwoman", "imp"]');
    expect(onAdded).toHaveBeenCalledWith(stored[0].id);
    expect(push).toHaveBeenCalledWith(`/scripts/custom?id=${stored[0].id}`);
  });

  it("uses the script's _meta name and author when present", async () => {
    render(<AddScriptDialog onAdded={vi.fn()} />);
    const user = userEvent.setup();

    await user.click(screen.getByText("Add a script"));
    fireEvent.change(screen.getByLabelText(/paste script-tool JSON/i), {
      target: {
        value: JSON.stringify([
          { id: "_meta", name: "My Script", author: "Me" },
          "washerwoman",
        ]),
      },
    });
    await user.click(screen.getByRole("button", { name: "Add script" }));

    expect(listCustomScripts()[0]).toMatchObject({
      name: "My Script",
      author: "Me",
    });
  });

  it("shows a friendly error and does not save when the JSON is malformed", async () => {
    render(<AddScriptDialog onAdded={vi.fn()} />);
    const user = userEvent.setup();

    await user.click(screen.getByText("Add a script"));
    fireEvent.change(screen.getByLabelText(/paste script-tool JSON/i), {
      target: { value: "{not json" },
    });
    await user.click(screen.getByRole("button", { name: "Add script" }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      /doesn't look like valid JSON/i,
    );
    expect(listCustomScripts()).toEqual([]);
    expect(push).not.toHaveBeenCalled();
  });

  it("shows a friendly error for an unknown character id", async () => {
    render(<AddScriptDialog onAdded={vi.fn()} />);
    const user = userEvent.setup();

    await user.click(screen.getByText("Add a script"));
    fireEvent.change(screen.getByLabelText(/paste script-tool JSON/i), {
      target: { value: '["not-a-character"]' },
    });
    await user.click(screen.getByRole("button", { name: "Add script" }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      /unknown character id.*not-a-character/i,
    );
  });

  it("renders every error even when two entries produce identical messages", async () => {
    render(<AddScriptDialog onAdded={vi.fn()} />);
    const user = userEvent.setup();

    await user.click(screen.getByText("Add a script"));
    fireEvent.change(screen.getByLabelText(/paste script-tool JSON/i), {
      target: { value: '["bogus", "bogus"]' },
    });
    await user.click(screen.getByRole("button", { name: "Add script" }));

    expect(
      screen.getAllByText('Unknown character id: "bogus".'),
    ).toHaveLength(2);
  });

  it("shows a friendly error when the file can't be read", async () => {
    const OriginalFileReader = globalThis.FileReader;
    class FailingFileReader extends OriginalFileReader {
      readAsText() {
        queueMicrotask(() =>
          this.onerror?.(new ProgressEvent("error") as ProgressEvent<FileReader>),
        );
      }
    }
    vi.stubGlobal("FileReader", FailingFileReader);

    try {
      render(<AddScriptDialog onAdded={vi.fn()} />);
      const user = userEvent.setup();

      await user.click(screen.getByText("Add a script"));
      const file = new File(['["washerwoman"]'], "script.json", {
        type: "application/json",
      });
      await user.upload(screen.getByLabelText(/upload a script-tool/i), file);

      expect(await screen.findByRole("alert")).toHaveTextContent(
        /couldn't read that file/i,
      );
      expect(listCustomScripts()).toEqual([]);
    } finally {
      vi.stubGlobal("FileReader", OriginalFileReader);
    }
  });

  it("accepts an uploaded file", async () => {
    render(<AddScriptDialog onAdded={vi.fn()} />);
    const user = userEvent.setup();

    await user.click(screen.getByText("Add a script"));
    const file = new File(['["washerwoman"]'], "script.json", {
      type: "application/json",
    });
    await user.upload(screen.getByLabelText(/upload a script-tool/i), file);
    await user.click(screen.getByRole("button", { name: "Add script" }));

    const stored = listCustomScripts();
    expect(stored).toHaveLength(1);
    expect(stored[0].rawText).toBe('["washerwoman"]');
  });
});
