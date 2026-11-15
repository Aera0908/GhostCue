import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ActionControls } from "./ActionControls";

function setup(isStreaming = false) {
  const props = { isStreaming, onTriggerAction: vi.fn(), onCancel: vi.fn() };
  render(<ActionControls {...props} />);
  return props;
}

describe("ActionControls", () => {
  it("keeps every action in one row and runs the one that is pressed", async () => {
    const props = setup();
    const user = userEvent.setup();

    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual(
      ["Answer", "Code", "Clarify", "System Design", "Summary", "Screen OCR"]
    );
    await user.click(screen.getByRole("button", { name: "Code" }));

    expect(props.onTriggerAction).toHaveBeenCalledTimes(1);
    expect(props.onTriggerAction).toHaveBeenCalledWith("code", undefined);
  });

  it("sends a typed question with Enter, trimmed, and clears the box", async () => {
    const props = setup();
    const user = userEvent.setup();
    const box = screen.getByRole("textbox", { name: "Ask a question" });

    await user.type(box, "   {Enter}");
    expect(props.onTriggerAction).not.toHaveBeenCalled();

    await user.type(box, "  what is a mutex \u{1F511} {Enter}");
    expect(props.onTriggerAction).toHaveBeenCalledWith("ask", "what is a mutex \u{1F511}");
    expect(box).toHaveValue("");
  });

  it("applies a pressed action to what was typed", async () => {
    const props = setup();
    const user = userEvent.setup();

    await user.type(screen.getByRole("textbox", { name: "Ask a question" }), "two sum");
    await user.click(screen.getByRole("button", { name: "Code" }));

    expect(props.onTriggerAction).toHaveBeenCalledWith("code", "two sum");
    expect(screen.getByRole("textbox", { name: "Ask a question" })).toHaveValue("");
  });

  it("offers only Stop while an answer is being written", async () => {
    const props = setup(true);
    const user = userEvent.setup();

    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual(["Stop"]);
    await user.type(screen.getByRole("textbox", { name: "Ask a question" }), "ignored{Enter}");
    expect(props.onTriggerAction).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Stop" }));
    expect(props.onCancel).toHaveBeenCalledTimes(1);
  });
});
