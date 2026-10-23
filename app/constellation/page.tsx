"use client";
import dynamic from "next/dynamic";

const ConstellationView = dynamic(() => import("@/components/ConstellationView"), { ssr: false });

export default function ConstellationPage() {
  return <ConstellationView />;
}
