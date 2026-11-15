import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Button } from "./Button";
import { Switch } from "./Switch";
import { Field, TextInput } from "./Field";
import { Notice } from "./Notice";

describe("Button", () => {
  it("does nothing while disabled or busy", async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(
      <Button onClick={onClick} disabled>
        Continue
      </Button>
    );
    await user.click(screen.getByRole("button", { name: "Continue" }));
    rerender(
      <Button onClick={onClick} busy>
        Continue
      </Button>
    );
    await user.dblClick(screen.getByRole("button", { name: "Continue" }));
    expect(onClick).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Continue" })).toHaveAttribute("aria-busy", "true");
  });

  it("is a plain button by default so it never submits a surrounding form", () => {
    render(<Button>Test</Button>);
    expect(screen.getByRole("button", { name: "Test" })).toHaveAttribute("type", "button");
  });
});

describe("Switch", () => {
  it("reports its state and toggles by click and keyboard", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Switch label="Hide from screen capture" checked={false} onChange={onChange} />);

    const control = screen.getByRole("switch", { name: "Hide from screen capture" });
    expect(control).toHaveAttribute("aria-checked", "false");
    await user.click(control);
    control.focus();
    await user.keyboard(" ");
    expect(onChange.mock.calls).toEqual([[true], [true]]);
  });

  it("does not toggle while disabled", async () => {
    const onChange = vi.fn();
    render(<Switch label="Auto answer" checked onChange={onChange} disabled />);
    await userEvent.setup().click(screen.getByRole("switch", { name: "Auto answer" }));
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("Field", () => {
  it("ties the label, the hint and the error to the input", () => {
    render(
      <Field label="Server address" hint="Where Ollama is running." error="The address must start with http://">
        {(props) => <TextInput {...props} value="" onChange={() => {}} />}
      </Field>
    );
    const input = screen.getByLabelText("Server address");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription(/Where Ollama is running\..*must start with http/);
    expect(screen.getByRole("alert")).toHaveTextContent("must start with http://");
  });
});

describe("Notice", () => {
  it("announces problems as alerts and everything else politely", () => {
    const { rerender } = render(<Notice kind="problem">Groq rejected the API key.</Notice>);
    expect(screen.getByRole("alert")).toHaveTextContent("Groq rejected the API key.");
    rerender(<Notice kind="good">Groq answered.</Notice>);
    expect(screen.getByRole("status")).toHaveTextContent("Groq answered.");
  });
});
