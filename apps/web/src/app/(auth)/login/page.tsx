import type { Metadata } from "next";
import Link from "next/link";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <>
      <LoginForm />
      <p className="text-ink-muted mt-5 text-center text-sm">
        Joining a team?{" "}
        <Link href="/signup" className="text-accent font-medium hover:underline">
          You&rsquo;ll need an invitation
        </Link>
      </p>
    </>
  );
}
