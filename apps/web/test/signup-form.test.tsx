import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ActionState } from "@/lib/action-state";

/**
 * The action is mocked so these tests exercise the form's own behaviour —
 * what it keeps, what it clears, and what it tells the user — without a
 * database or a server. The action's own logic is covered in @acct/auth
 * and @acct/ledger.
 */
const signUpAction = vi.fn();

vi.mock("@/actions/auth", () => ({
  signUpAction: (prev: ActionState, form: FormData) => signUpAction(prev, form),
}));

const { SignupForm } = await import("@/app/(auth)/signup/signup-form");

const VALID = {
  organizationName: "Acme Consulting",
  name: "Dana Reed",
  email: "dana@acme.test",
  password: "correct horse battery staple",
};

async function fillForm(user: ReturnType<typeof userEvent.setup>, overrides: Partial<typeof VALID> & { confirmPassword?: string } = {}) {
  const values = { ...VALID, confirmPassword: VALID.password, ...overrides };
  await user.type(screen.getByLabelText("Organization name"), values.organizationName);
  await user.type(screen.getByLabelText("Your name"), values.name);
  await user.type(screen.getByLabelText("Email"), values.email);
  await user.type(screen.getByLabelText("Password"), values.password);
  await user.type(screen.getByLabelText("Confirm password"), values.confirmPassword);
  return values;
}

const submit = (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole("button", { name: /create account/i }));

beforeEach(() => {
  signUpAction.mockReset();
  // Default: the server rejects. Most of these tests are about what the form
  // does with a rejection.
  signUpAction.mockResolvedValue({ error: "Something went wrong" } as ActionState);
});

describe("SignupForm — preserving input on error", () => {
  it("keeps what the user typed when the server rejects", async () => {
    const user = userEvent.setup();
    render(<SignupForm />);
    const values = await fillForm(user);
    await submit(user);

    await screen.findByText("Something went wrong");

    // The regression: React 19 resets uncontrolled fields after a form
    // action, so every one of these came back blank and the user had to
    // retype the whole form to fix one field.
    expect(screen.getByLabelText("Organization name")).toHaveValue(values.organizationName);
    expect(screen.getByLabelText("Your name")).toHaveValue(values.name);
    expect(screen.getByLabelText("Email")).toHaveValue(values.email);
  });

  it("clears both password fields on error but keeps everything else", async () => {
    const user = userEvent.setup();
    render(<SignupForm />);
    await fillForm(user);
    await submit(user);

    await screen.findByText("Something went wrong");

    // Passwords are deliberately not preserved: re-rendering a password into
    // the HTML is a needless exposure, and retyping one field is cheap.
    expect(screen.getByLabelText("Password")).toHaveValue("");
    expect(screen.getByLabelText("Confirm password")).toHaveValue("");
    expect(screen.getByLabelText("Email")).toHaveValue(VALID.email);
  });

  it("never echoes a password back into the DOM", async () => {
    const user = userEvent.setup();
    const { container } = render(<SignupForm />);
    await fillForm(user);
    await submit(user);

    await screen.findByText("Something went wrong");
    expect(container.innerHTML).not.toContain(VALID.password);
  });
});

describe("SignupForm — password confirmation", () => {
  it("reports a mismatch without calling the server", async () => {
    const user = userEvent.setup();
    render(<SignupForm />);
    await fillForm(user, { confirmPassword: "something else entirely" });
    await submit(user);

    expect(await screen.findByText(/don't match/i)).toBeInTheDocument();
    // A mismatch is knowable on the client; a round trip adds latency and
    // was what wiped the form in the first place.
    expect(signUpAction).not.toHaveBeenCalled();
  });

  it("keeps every field after a mismatch", async () => {
    const user = userEvent.setup();
    render(<SignupForm />);
    await fillForm(user, { confirmPassword: "nope" });
    await submit(user);

    await screen.findByText(/don't match/i);
    expect(screen.getByLabelText("Organization name")).toHaveValue(VALID.organizationName);
    expect(screen.getByLabelText("Email")).toHaveValue(VALID.email);
  });

  it("clears the mismatch message once the passwords agree", async () => {
    const user = userEvent.setup();
    render(<SignupForm />);
    await fillForm(user, { confirmPassword: "nope" });
    await submit(user);
    await screen.findByText(/don't match/i);

    await user.clear(screen.getByLabelText("Confirm password"));
    await user.type(screen.getByLabelText("Confirm password"), VALID.password);

    await waitFor(() => {
      expect(screen.queryByText(/don't match/i)).not.toBeInTheDocument();
    });
  });

  it("submits to the server when the passwords match", async () => {
    const user = userEvent.setup();
    render(<SignupForm />);
    await fillForm(user);
    await submit(user);

    await waitFor(() => expect(signUpAction).toHaveBeenCalledTimes(1));

    const form = signUpAction.mock.calls[0]?.[1] as FormData;
    expect(form.get("email")).toBe(VALID.email);
    expect(form.get("organizationName")).toBe(VALID.organizationName);
    expect(form.get("password")).toBe(VALID.password);
  });
});

describe("SignupForm — field-level errors", () => {
  it("shows a server field error against the right input", async () => {
    signUpAction.mockResolvedValue({
      error: "Check the form",
      fieldErrors: { email: "That email is already registered" },
    } as ActionState);

    const user = userEvent.setup();
    render(<SignupForm />);
    await fillForm(user);
    await submit(user);

    expect(await screen.findByText("That email is already registered")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toHaveAttribute("aria-invalid", "true");
  });
});
