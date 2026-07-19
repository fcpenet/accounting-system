import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { cents } from "@acct/core";
import { Money } from "@/components/money";

describe("Money", () => {
  it("renders a plain positive amount", () => {
    render(<Money value={cents(123456)} />);
    expect(screen.getByText("1,234.56")).toBeInTheDocument();
  });

  it("wraps negatives in parentheses, per accounting convention", () => {
    render(<Money value={cents(-123456)} />);
    // Not "-1,234.56": parentheses are the convention, and they stay legible
    // when a minus sign is easy to miss in a dense column.
    expect(screen.getByText("(1,234.56)")).toBeInTheDocument();
  });

  it("pads to two decimal places", () => {
    const { rerender } = render(<Money value={cents(5)} />);
    expect(screen.getByText("0.05")).toBeInTheDocument();
    rerender(<Money value={cents(50)} />);
    expect(screen.getByText("0.50")).toBeInTheDocument();
  });

  it("shows zero when asked, and a dash when not", () => {
    const { rerender, container } = render(<Money value={cents(0)} showZero />);
    expect(screen.getByText("0.00")).toBeInTheDocument();
    rerender(<Money value={cents(0)} showZero={false} />);
    expect(container).toHaveTextContent("—");
  });

  it("always uses tabular figures so columns align", () => {
    const { container } = render(<Money value={cents(100)} />);
    // The single most important typographic detail in a ledger: digits must
    // occupy equal width or the columns don't line up.
    expect(container.querySelector(".tnum")).toBeInTheDocument();
  });

  it("tints by sign only when explicitly asked", () => {
    const plain = render(<Money value={cents(-500)} />).container;
    expect(plain.querySelector(".text-negative")).toBeNull();

    const tinted = render(<Money value={cents(-500)} colour />).container;
    expect(tinted.querySelector(".text-negative")).toBeInTheDocument();
  });

  it("does not rely on colour alone to convey a negative", () => {
    const { container } = render(<Money value={cents(-500)} colour />);
    // Parentheses carry the meaning for anyone who can't distinguish the
    // tint; the colour is reinforcement, not the signal.
    expect(container).toHaveTextContent("(5.00)");
  });

  it("renders large amounts with thousands separators", () => {
    render(<Money value={cents(123456789)} />);
    expect(screen.getByText("1,234,567.89")).toBeInTheDocument();
  });
});
