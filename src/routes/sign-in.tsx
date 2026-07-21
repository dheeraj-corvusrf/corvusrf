import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

export const Route = createFileRoute("/sign-in")({
  head: () => ({
    meta: [
      { title: "Sign In — CorvusRF.ai" },
      { name: "description", content: "Sign in to your CorvusRF.ai property tax dashboard." },
      { property: "og:title", content: "Sign In — CorvusRF.ai" },
      { property: "og:description", content: "Access your property tax dashboard." },
    ],
  }),
  component: SignIn,
});

function SignIn() {
  const nav = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  return (
    <div className="container-page py-16 max-w-md">
      <span className="badge-soft">{mode === "signin" ? "Sign In" : "Create Account"}</span>
      <h1 className="mt-3 font-serif text-3xl font-semibold">
        {mode === "signin" ? "Welcome back." : "Create your CorvusRF account."}
      </h1>
      <p className="mt-2 text-muted-foreground">
        {mode === "signin"
          ? "Your properties, protests, deadlines, and savings — all in one place."
          : "Save your property, analysis, documents, and preview history."}
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          sessionStorage.setItem("crf_signed_in", "1");
          nav({ to: "/dashboard" });
        }}
        className="mt-8 card-elev p-6 grid gap-4"
      >
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Email</span>
          <input required type="email" className="rounded-md border border-input bg-background px-3 py-2" defaultValue="demo@corvusrf.ai" />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Password</span>
          <input required type="password" className="rounded-md border border-input bg-background px-3 py-2" defaultValue="password" />
        </label>
        <button className="btn-primary btn-primary-hover">
          {mode === "signin" ? "Sign In" : "Create Account"}
        </button>
        <button
          type="button"
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          {mode === "signin" ? "Need an account? Create one." : "Already have an account? Sign in."}
        </button>
      </form>
    </div>
  );
}
