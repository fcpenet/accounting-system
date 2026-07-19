import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Account } from "@acct/core";
import type { ActionState } from "@/lib/action-state";

const createEntryAction = vi.fn();

vi.mock("@/actions/entries", () => ({
  createEntryAction: (prev: ActionState, form: FormData) => createEntryAction(prev, form),
}));

const { EntryForm } = await import("@/app/(app)/journal/new/entry-form");

const ACCOUNTS: Account[] = [
  { id: "cash", code: "1000", name: "Cash", type: "asset" },
  { id: "ar", code: "1200", name: "Accounts Receivable", type: "asset" },
  { id: "revenue", code: "4000", name: "Sales Revenue", type: "income" },
  { id: "rent", code: "5100", name: "Rent", type: "expense" },
];

const TODAY = "2026-07-19";

const renderForm = () => render(<EntryForm accounts={ACCOUNTS} today={TODAY} />);
const postButton = () => screen.getByRole("button", { name: /post entry/i });

/** Fill line `index` (0-based) with an account, side and amount. */
async function fillLine(
  user: ReturnType<typeof userEvent.setup>,
  index: number,
  accountId: string,
  side: "debit" | "credit",
  amount: string,
) {
  const accountSelects = screen.getAllByLabelText("Account");
  const amountInputs = screen.getAllByLabelText("Amount");
  await user.selectOptions(accountSelects[index]!, accountId);

  const row = accountSelects[index]!.closest("li")!;
  await user.click(within(row).getByRole("button", { name: side }));
  await user.type(amountInputs[index]!, amount);
}

beforeEach(() => {
  createEntryAction.mockReset();
  createEntryAction.mockResolvedValue({} as ActionState);
});

describe("EntryForm — balance readout", () => {
  it("starts with the post button disabled", () => {
    renderForm();
    expect(postButton()).toBeDisabled();
    expect(screen.getByText(/enter amounts on both sides/i)).toBeInTheDocument();
  });

  it("reports the shortfall while the entry is out of balance", async () => {
    const user = userEvent.setup();
    renderForm();

    await fillLine(user, 0, "cash", "debit", "100.00");
    await fillLine(user, 1, "revenue", "credit", "99.99");

    expect(await screen.findByText(/out of balance by/i)).toBeInTheDocument();
    expect(screen.getByText("0.01")).toBeInTheDocument();
    // An unbalanced entry can never be valid, so don't let it be submitted.
    expect(postButton()).toBeDisabled();
  });

  it("enables posting once debits equal credits", async () => {
    const user = userEvent.setup();
    renderForm();

    await fillLine(user, 0, "cash", "debit", "100.00");
    await fillLine(user, 1, "revenue", "credit", "100.00");

    expect(await screen.findByText(/balanced/i)).toBeInTheDocument();
    await waitFor(() => expect(postButton()).toBeEnabled());
  });

  it("totals debits and credits as typed", async () => {
    const user = userEvent.setup();
    renderForm();

    await fillLine(user, 0, "cash", "debit", "1234.56");
    await fillLine(user, 1, "revenue", "credit", "1234.56");

    await waitFor(() => {
      expect(screen.getAllByText("1,234.56").length).toBeGreaterThanOrEqual(2);
    });
  });

  it("ignores half-typed amounts instead of crashing", async () => {
    const user = userEvent.setup();
    renderForm();

    const amounts = screen.getAllByLabelText("Amount");
    // A lone "." or "-" must not throw while the user is mid-keystroke.
    await user.type(amounts[0]!, ".");
    await user.type(amounts[1]!, "-");

    expect(postButton()).toBeDisabled();
    expect(screen.getByText(/enter amounts on both sides/i)).toBeInTheDocument();
  });
});

describe("EntryForm — lines", () => {
  it("starts with two lines, one per side", () => {
    renderForm();
    expect(screen.getAllByLabelText("Account")).toHaveLength(2);
  });

  it("adds a line", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByRole("button", { name: /add line/i }));
    expect(screen.getAllByLabelText("Account")).toHaveLength(3);
  });

  it("supports a compound entry across three accounts", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByRole("button", { name: /add line/i }));
    await fillLine(user, 0, "rent", "debit", "60.00");
    await fillLine(user, 1, "ar", "debit", "40.00");
    await fillLine(user, 2, "cash", "credit", "100.00");

    expect(await screen.findByText(/balanced/i)).toBeInTheDocument();
  });

  it("won't let the entry drop below two lines", async () => {
    const user = userEvent.setup();
    renderForm();

    // Double-entry needs at least two lines, so removal stops there.
    const removes = screen.getAllByRole("button", { name: /remove line/i });
    removes.forEach((button) => expect(button).toBeDisabled());
  });

  it("groups accounts by type in the picker", () => {
    renderForm();
    const select = screen.getAllByLabelText("Account")[0]!;
    const groups = within(select).getAllByRole("group");
    expect(groups.map((g) => g.getAttribute("label"))).toEqual([
      "Asset",
      "Income",
      "Expense",
    ]);
  });
});

describe("EntryForm — preserving input on error", () => {
  it("keeps description, date and reference when the server rejects", async () => {
    createEntryAction.mockResolvedValue({ error: "Entry rejected" } as ActionState);

    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByLabelText("Description"), "Invoice #1024");
    await user.clear(screen.getByLabelText("Date"));
    await user.type(screen.getByLabelText("Date"), "2026-03-01");
    await user.type(screen.getByLabelText("Reference"), "INV-1024");
    await fillLine(user, 0, "cash", "debit", "100.00");
    await fillLine(user, 1, "revenue", "credit", "100.00");

    await user.click(postButton());
    await screen.findByText("Entry rejected");

    // These are the slowest fields to retype; losing them on a rejected
    // entry is what made the old form painful.
    expect(screen.getByLabelText("Description")).toHaveValue("Invoice #1024");
    expect(screen.getByLabelText("Date")).toHaveValue("2026-03-01");
    expect(screen.getByLabelText("Reference")).toHaveValue("INV-1024");
  });

  it("keeps the line rows when the server rejects", async () => {
    createEntryAction.mockResolvedValue({ error: "Entry rejected" } as ActionState);

    const user = userEvent.setup();
    renderForm();
    // Description is required, so the browser blocks submission without it
    // and the action would never run.
    await user.type(screen.getByLabelText("Description"), "Cash sale");
    await fillLine(user, 0, "cash", "debit", "100.00");
    await fillLine(user, 1, "revenue", "credit", "100.00");

    await user.click(postButton());
    await screen.findByText("Entry rejected");

    expect(screen.getAllByLabelText("Amount")[0]).toHaveValue("100.00");
    expect(screen.getAllByLabelText("Account")[0]).toHaveValue("cash");
  });

  it("shows a per-line error against the offending row", async () => {
    createEntryAction.mockResolvedValue({
      error: "Fix the highlighted lines",
      fieldErrors: { "accountId.1": "Unknown account" },
    } as ActionState);

    const user = userEvent.setup();
    renderForm();
    await user.type(screen.getByLabelText("Description"), "Cash sale");
    await fillLine(user, 0, "cash", "debit", "100.00");
    await fillLine(user, 1, "revenue", "credit", "100.00");
    await user.click(postButton());

    expect(await screen.findByText("Unknown account")).toBeInTheDocument();
    expect(screen.getAllByLabelText("Account")[1]).toHaveAttribute("aria-invalid", "true");
  });
});

describe("EntryForm — submission", () => {
  it("sends one aligned triple per line", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByLabelText("Description"), "Cash sale");
    await fillLine(user, 0, "cash", "debit", "250.00");
    await fillLine(user, 1, "revenue", "credit", "250.00");
    await user.click(postButton());

    await waitFor(() => expect(createEntryAction).toHaveBeenCalledTimes(1));
    const form = createEntryAction.mock.calls[0]?.[1] as FormData;

    expect(form.get("description")).toBe("Cash sale");
    expect(form.getAll("accountId")).toEqual(["cash", "revenue"]);
    expect(form.getAll("direction")).toEqual(["debit", "credit"]);
    expect(form.getAll("amount")).toEqual(["250.00", "250.00"]);
  });

  it("defaults the date to today", () => {
    renderForm();
    expect(screen.getByLabelText("Date")).toHaveValue(TODAY);
  });
});
