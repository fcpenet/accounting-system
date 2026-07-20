import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ActionState } from "@/lib/action-state";

const acceptInvitationAction = vi.fn();

vi.mock("@/actions/invitations", () => ({
  acceptInvitationAction: (prev: ActionState, form: FormData) =>
    acceptInvitationAction(prev, form),
}));

const { AcceptForm } = await import("@/app/(auth)/invite/[token]/accept-form");

const TOKEN = "invite-token-123";
const EMAIL = "invitee@acme.test";
const PASSWORD = "correct horse battery staple";

const renderForm = () => render(<AcceptForm token={TOKEN} email={EMAIL} />);
const submit = (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole("button", { name: /accept & create account/i }));

beforeEach(() => {
  acceptInvitationAction.mockReset();
  acceptInvitationAction.mockResolvedValue({} as ActionState);
});

describe("AcceptForm", () => {
  it("shows the invited email, locked so it can't be changed", () => {
    renderForm();
    const email = screen.getByLabelText("Email") as HTMLInputElement;
    expect(email).toHaveValue(EMAIL);
    // The invite is bound to this address; editing it here would be
    // meaningless (the token, not the field, decides the account).
    expect(email).toBeDisabled();
  });

  it("submits the token and password to the server", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByLabelText("Password"), PASSWORD);
    await user.type(screen.getByLabelText("Confirm password"), PASSWORD);
    await submit(user);

    await waitFor(() => expect(acceptInvitationAction).toHaveBeenCalledTimes(1));
    const form = acceptInvitationAction.mock.calls[0]?.[1] as FormData;
    expect(form.get("token")).toBe(TOKEN);
    expect(form.get("password")).toBe(PASSWORD);
  });

  it("catches a password mismatch on the client, without calling the server", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByLabelText("Password"), PASSWORD);
    await user.type(screen.getByLabelText("Confirm password"), "different");
    await submit(user);

    expect(await screen.findByText(/don't match/i)).toBeInTheDocument();
    expect(acceptInvitationAction).not.toHaveBeenCalled();
  });

  it("keeps the name and passwords visible after a server error", async () => {
    acceptInvitationAction.mockResolvedValue({ error: "This invitation is no longer valid" });
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByLabelText("Your name"), "Jo Rivera");
    await user.type(screen.getByLabelText("Password"), PASSWORD);
    await user.type(screen.getByLabelText("Confirm password"), PASSWORD);
    await submit(user);

    await screen.findByText("This invitation is no longer valid");
    // Controlled inputs must survive the action (the React 19 reset lesson).
    expect(screen.getByLabelText("Your name")).toHaveValue("Jo Rivera");
    expect(screen.getByLabelText("Email")).toHaveValue(EMAIL);
  });

  it("offers a password reveal toggle", async () => {
    const user = userEvent.setup();
    renderForm();
    const password = screen.getByLabelText("Password");
    expect(password).toHaveAttribute("type", "password");
    // The reveal control from PasswordInput is present on this field.
    const toggles = screen.getAllByRole("button", { name: /show password/i });
    await user.click(toggles[0]!);
    expect(password).toHaveAttribute("type", "text");
  });
});
