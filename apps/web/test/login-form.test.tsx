import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ActionState } from "@/lib/action-state";

const signInAction = vi.fn();

vi.mock("@/actions/auth", () => ({
  signInAction: (prev: ActionState, form: FormData) => signInAction(prev, form),
}));

const { LoginForm } = await import("@/app/(auth)/login/login-form");

const EMAIL = "dana@acme.test";
const PASSWORD = "correct horse battery staple";

async function signIn(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Email"), EMAIL);
  await user.type(screen.getByLabelText("Password"), PASSWORD);
  await user.click(screen.getByRole("button", { name: /sign in/i }));
}

beforeEach(() => {
  signInAction.mockReset();
  signInAction.mockResolvedValue({ error: "Incorrect email or password" } as ActionState);
});

describe("LoginForm", () => {
  it("keeps the email after a failed attempt", async () => {
    const user = userEvent.setup();
    render(<LoginForm />);
    await signIn(user);

    await screen.findByText("Incorrect email or password");
    // Mistyping a password shouldn't cost you the email too.
    expect(screen.getByLabelText("Email")).toHaveValue(EMAIL);
  });

  it("clears only the password after a failed attempt", async () => {
    const user = userEvent.setup();
    render(<LoginForm />);
    await signIn(user);

    await screen.findByText("Incorrect email or password");
    expect(screen.getByLabelText("Password")).toHaveValue("");
  });

  it("never leaves the password in the markup", async () => {
    const user = userEvent.setup();
    const { container } = render(<LoginForm />);
    await signIn(user);

    await screen.findByText("Incorrect email or password");
    expect(container.innerHTML).not.toContain(PASSWORD);
  });

  it("passes the credentials through to the action", async () => {
    const user = userEvent.setup();
    render(<LoginForm />);
    await signIn(user);

    await waitFor(() => expect(signInAction).toHaveBeenCalledTimes(1));
    const form = signInAction.mock.calls[0]?.[1] as FormData;
    expect(form.get("email")).toBe(EMAIL);
    expect(form.get("password")).toBe(PASSWORD);
  });

  it("shows one error message, not a per-field breakdown", async () => {
    const user = userEvent.setup();
    render(<LoginForm />);
    await signIn(user);

    // Distinguishing "no such user" from "wrong password" would turn this
    // form into an account-enumeration oracle.
    const errors = await screen.findAllByRole("alert");
    expect(errors).toHaveLength(1);
    expect(errors[0]).toHaveTextContent("Incorrect email or password");
  });

  it("lets the user retry without retyping the email", async () => {
    const user = userEvent.setup();
    render(<LoginForm />);
    await signIn(user);
    await screen.findByText("Incorrect email or password");

    signInAction.mockResolvedValue({} as ActionState);
    await user.type(screen.getByLabelText("Password"), "second attempt password");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => expect(signInAction).toHaveBeenCalledTimes(2));
    const form = signInAction.mock.calls[1]?.[1] as FormData;
    expect(form.get("email")).toBe(EMAIL);
    expect(form.get("password")).toBe("second attempt password");
  });
});
