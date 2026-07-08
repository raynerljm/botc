import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { FilePickerButton } from "./FilePickerButton";

describe("FilePickerButton", () => {
  it("renders a labelled file input with the given button text", () => {
    render(
      <FilePickerButton buttonLabel="Upload a script-tool JSON file" onChange={vi.fn()} />,
    );

    expect(
      screen.getByLabelText("Upload a script-tool JSON file"),
    ).toHaveAttribute("type", "file");
  });

  it("calls onChange with the native change event when a file is picked", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<FilePickerButton buttonLabel="Upload a script-tool JSON file" onChange={onChange} />);
    const file = new File(["{}"], "script.json", { type: "application/json" });

    await user.upload(screen.getByLabelText("Upload a script-tool JSON file"), file);

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].target.files[0]).toBe(file);
  });

  it("shows the picked file's name once selected", async () => {
    const user = userEvent.setup();
    render(<FilePickerButton buttonLabel="Upload a script-tool JSON file" onChange={vi.fn()} />);
    const file = new File(["{}"], "script.json", { type: "application/json" });

    await user.upload(screen.getByLabelText("Upload a script-tool JSON file"), file);

    expect(screen.getByText("script.json")).toBeInTheDocument();
  });

  it("keeps the input's accessible name stable after a file is picked, instead of growing to include the filename (code review finding)", async () => {
    const user = userEvent.setup();
    render(<FilePickerButton buttonLabel="Upload a script-tool JSON file" onChange={vi.fn()} />);
    const file = new File(["{}"], "script.json", { type: "application/json" });

    await user.upload(screen.getByLabelText("Upload a script-tool JSON file"), file);

    expect(
      screen.getByLabelText("Upload a script-tool JSON file"),
    ).toHaveAttribute("type", "file");
  });
});
