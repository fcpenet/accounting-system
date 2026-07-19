import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PasswordInput } from "@/components/password-input";

const SECRET = "correct horse battery staple";

const toggle = () => screen.getByRole("button");
const field = () => screen.getByLabelText("Password");

function renderField(props: Record<string, unknown> = {}) {
  return render(
    <>
      <label htmlFor="password">Password</label>
      <PasswordInput id="password" name="password" {...props} />
    </>,
  );
}

describe("PasswordInput", () => {
  it("hides the password by default", () => {
    renderField();
    expect(field()).toHaveAttribute("type", "password");
  });

  it("reveals and re-hides on toggle", async () => {
    const user = userEvent.setup();
    renderField();

    await user.type(field(), SECRET);
    await user.click(toggle());
    expect(field()).toHaveAttribute("type", "text");

    await user.click(toggle());
    expect(field()).toHaveAttribute("type", "password");
  });

  it("keeps the typed value across a toggle", async () => {
    const user = userEvent.setup();
    renderField();

    await user.type(field(), SECRET);
    await user.click(toggle());
    // Revealing must not cost the user what they typed.
    expect(field()).toHaveValue(SECRET);
  });

  it("describes what the button will do, not what it did", async () => {
    const user = userEvent.setup();
    renderField();

    expect(toggle()).toHaveAccessibleName("Show password");
    await user.click(toggle());
    expect(toggle()).toHaveAccessibleName("Hide password");
  });

  it("reports its state to assistive tech", async () => {
    const user = userEvent.setup();
    renderField();

    expect(toggle()).toHaveAttribute("aria-pressed", "false");
    await user.click(toggle());
    expect(toggle()).toHaveAttribute("aria-pressed", "true");
  });

  it("does not submit the form it sits in", async () => {
    const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
    const user = userEvent.setup();
    render(
      <form onSubmit={onSubmit}>
        <label htmlFor="password">Password</label>
        <PasswordInput id="password" name="password" />
      </form>,
    );

    // type="button" — without it, the toggle would submit the form.
    await user.click(screen.getByRole("button"));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("never writes the password into the markup, even when revealed", async () => {
    const user = userEvent.setup();
    const { container } = renderField();

    await user.type(field(), SECRET);
    await user.click(toggle());

    // Revealing flips the input type; React still sets the value as a DOM
    // property, so it never lands in serialised HTML.
    expect(container.innerHTML).not.toContain(SECRET);
  });

  it("keeps the field usable by password managers", () => {
    renderField({ autoComplete: "current-password" });
    expect(field()).toHaveAttribute("name", "password");
    expect(field()).toHaveAttribute("autocomplete", "current-password");
  });

  it("passes through validation attributes", () => {
    renderField({ required: true, minLength: 10 });
    expect(field()).toBeRequired();
    expect(field()).toHaveAttribute("minlength", "10");
  });

  it("marks itself invalid when asked", () => {
    renderField({ invalid: true });
    expect(field()).toHaveAttribute("aria-invalid", "true");
  });
});
