"use client";
import { motion } from "framer-motion";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

const STEPS = [
  {
    icon: "⌨️",
    title: "Build like you normally would",
    body: "Describe an app. Claude writes the code and the preview updates live.",
  },
  {
    icon: "✦",
    title: "Catch a glint",
    body: "When Claude makes a decision worth understanding, it highlights the lines and asks: did you catch why?",
  },
  {
    icon: "★",
    title: "Earn stars, unlock badges",
    body: "Guess first for double stars. Your constellation grows with every concept you learn.",
  },
];

export default function Home() {
  return (
    <Suspense>
      <Landing />
    </Suspense>
  );
}

function Landing() {
  const router = useRouter();
  const locked = useSearchParams().get("locked") === "1";
  const [required, setRequired] = useState<boolean | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/access")
      .then((r) => r.json())
      .then((d: { required: boolean }) => setRequired(d.required))
      .catch(() => setRequired(false));
  }, []);

  const unlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const res = await fetch("/api/access", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    if (res.ok) router.push("/build");
    else setError(((await res.json()) as { error?: string }).error ?? "Wrong code.");
  };

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="starfield" />
      <main className="relative mx-auto flex max-w-4xl flex-col items-center px-6 pb-24 pt-28 text-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.6, rotate: -90 }}
          animate={{ opacity: 1, scale: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 120, damping: 14 }}
          className="text-5xl text-star drop-shadow-[0_0_24px_rgba(250,204,21,0.7)]"
        >
          ✦
        </motion.div>
        <motion.h1
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mt-6 text-5xl font-semibold tracking-tight text-zinc-50 sm:text-6xl"
        >
          Build fast. <span className="text-star">Still learn.</span>
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mt-5 max-w-xl text-lg text-zinc-400"
        >
          Constellation is a coding workspace where Claude does the heavy lifting and occasionally
          shows you the engineering decisions worth understanding. It&apos;s not a tutorial and it
          won&apos;t slow you down.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="mt-10"
        >
          {required === null ? (
            <div className="h-12" />
          ) : required ? (
            <form onSubmit={unlock} className="flex flex-col items-center gap-2">
              {locked && <p className="text-sm text-zinc-400">Enter the access code to start building.</p>}
              <div className="flex gap-2">
                <input
                  type="password"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="Access code"
                  aria-label="Access code"
                  className="w-56 rounded-full border border-white/15 bg-white/5 px-5 py-3 text-zinc-100 placeholder:text-zinc-500 focus:border-star/60 focus:outline-none"
                />
                <button className="rounded-full bg-star px-6 py-3 font-semibold text-stone-900 hover:brightness-110">
                  Start building →
                </button>
              </div>
              {error && <p className="text-sm text-red-300">{error}</p>}
            </form>
          ) : (
            <Link
              href="/build"
              className="inline-block rounded-full bg-star px-8 py-3.5 text-lg font-semibold text-stone-900 shadow-[0_0_40px_-6px_rgba(250,204,21,0.7)] transition hover:brightness-110"
            >
              Start building →
            </Link>
          )}
        </motion.div>

        <div className="mt-24 grid gap-4 text-left sm:grid-cols-3">
          {STEPS.map((s, i) => (
            <motion.div
              key={s.title}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 + i * 0.1 }}
              className="rounded-2xl border border-white/10 bg-white/[0.03] p-5"
            >
              <div className="text-2xl text-star">{s.icon}</div>
              <h3 className="mt-3 font-semibold text-zinc-100">{s.title}</h3>
              <p className="mt-1 text-sm text-zinc-400">{s.body}</p>
            </motion.div>
          ))}
        </div>
      </main>
    </div>
  );
}
