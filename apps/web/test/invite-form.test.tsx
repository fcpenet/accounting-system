import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InviteState } from "@/actions/invitations";

const createInvitationAction = vi.fn();

vi.mock("@/actions/invitations", () => ({
  createInvitationAction: (prev: InviteState, form: FormData) =>
    createInvitationAction(prev, form),
}));

const { InviteForm } = await import("@/app/(app)/team/invite-form");

const submit = (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole("button", { name: /create invite link/i }));

beforeEach(() => {
  createInvitationAction.mockReset();
  createInvitationAction.mockResolvedValue({} as InviteState);
});

describe("InviteForm", () => {
  it("defaults to editor and offers only invitable roles", () => {
    render(<InviteForm />);
    const role = screen.getByLabelText("Role") as HTMLSelectElement;
    expect(role).toHaveValue("editor");
    const options = [...role.options].map((o) => o.value);
    // Never "owner" — ownership isn't handed out by invitation.
    expect(options).toEqual(["editor", "viewer"]);
  });

  it("sends the email and role to the server", async () => {
    const user = userEvent.setup();
    render(<InviteForm />);

    await user.type(screen.getByLabelText("Email"), "teammate@acme.test");
    await user.selectOptions(screen.getByLabelText("Role"), "viewer");
    await submit(user);

    await waitFor(() => expect(createInvitationAction).toHaveBeenCalledTimes(1));
    const form = createInvitationAction.mock.calls[0]?.[1] as FormData;
    expect(form.get("email")).toBe("teammate@acme.test");
    expect(form.get("role")).toBe("viewer");
  });

  it("reveals the copyable link on success", async () => {
    createInvitationAction.mockResolvedValue({
      ok: true,
      link: "https://app.test/invite/abc123",
      invitedEmail: "teammate@acme.test",
    } as InviteState);

    const user = userEvent.setup();
    render(<InviteForm />);
    await user.type(screen.getByLabelText("Email"), "teammate@acme.test");
    await submit(user);

    const linkField = (await screen.findByDisplayValue(
      "https://app.test/invite/abc123",
    )) as HTMLInputElement;
    expect(linkField).toBeInTheDocument();
    expect(linkField).toHaveAttribute("readonly");

    // userEvent installs its own clipboard stub, so assert the user-visible
    // outcome — the button confirming the copy — rather than the spy.
    await user.click(screen.getByRole("button", { name: /^copy$/i }));
    expect(await screen.findByRole("button", { name: /copied/i })).toBeInTheDocument();
  });

  it("keeps the email visible after a server error", async () => {
    createInvitationAction.mockResolvedValue({
      error: "That person is already a member",
    } as InviteState);

    const user = userEvent.setup();
    render(<InviteForm />);
    await user.type(screen.getByLabelText("Email"), "dupe@acme.test");
    await submit(user);

    await screen.findByText("That person is already a member");
    expect(screen.getByLabelText("Email")).toHaveValue("dupe@acme.test");
  });
});
