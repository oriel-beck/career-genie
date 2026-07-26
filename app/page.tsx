"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { db } from "@/lib/db";

export default function HomePage() {
  const [hasProfile, setHasProfile] = useState<boolean>();

  useEffect(() => {
    void db.profiles.get(1).then((profile) => setHasProfile(Boolean(profile)));
  }, []);

  if (hasProfile === undefined) {
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
          <Link
            className="button-link"
            href={hasProfile ? "/dashboard" : "/onboarding"}
          >
            {hasProfile ? "Open jobs" : "Start onboarding"}
          </Link>
        </div>
      </section>
    </AppShell>
  );
}
