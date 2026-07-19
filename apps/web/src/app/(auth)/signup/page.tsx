import type { Metadata } from "next";
import Link from "next/link";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = { title: "Create account" };

export default function SignupPage() {
  return (
    <>
      <SignupForm />
      <p className="text-ink-muted mt-5 text-center text-sm">
        Already have an account?{" "}
        <Link href="/login" className="text-accent font-medium hover:underline">
          Sign in
        </Link>
      </p>
    </>
  );
}
