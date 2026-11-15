import React from "react";

type Kind = "problem" | "good" | "info";

const TEXT: Record<Kind, string> = {
  problem: "text-g-danger",
  good: "text-g-good",
  info: "text-g-muted",
};

/** One line of status under a control. Problems interrupt a screen reader; the rest wait their turn. */
export const Notice: React.FC<{ kind: Kind; children: React.ReactNode; className?: string }> = ({
  kind,
  children,
  className = "",
}) => (
  <p role={kind === "problem" ? "alert" : "status"} className={`text-[13px] leading-5 ${TEXT[kind]} ${className}`}>
    {children}
  </p>
);
