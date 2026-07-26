"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { db } from "@/lib/db";

export default function HomePage() {
  const [startHref, setStartHref] = useState<string>();
  const [startLabel, setStartLabel] = useState("Continue");

  useEffect(() => {
    void Promise.all([db.profiles.get(1), db.settings.get(1)]).then(([profile, settings]) => {
      if (profile) {
        setStartHref("/dashboard");
        setStartLabel("Open jobs");
        return;
      }
      if (settings?.keyHint) {
        setStartHref("/onboarding");
        setStartLabel("Set up profile");
        return;
      }
      setStartHref("/settings");
      setStartLabel("Add API key");
    });
  }, []);

  if (startHref === undefined) {
    return (
      <AppShell>
        <p className="page status" aria-live="polite">
          Opening Career Genie…
        </p>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <section className="home-hero" aria-labelledby="home-brand">
        <h1 id="home-brand" className="home-brand">
          Career Genie
        </h1>
        <p className="home-lead">Private resume tailoring in your browser.</p>
        <div className="home-actions button-row">
          <Link className="button-link" href={startHref}>
            {startLabel}
          </Link>
        </div>
      </section>
    </AppShell>
  );
}
