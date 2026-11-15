import React from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

interface StepTransitionProps {
  /** Changes when the step changes. */
  stepKey: string;
  /** 1 when moving forward, -1 when moving back. The new step enters from that side. */
  direction: 1 | -1;
  children: React.ReactNode;
}

const EASE_OUT_CUBIC: [number, number, number, number] = [0.33, 1, 0.68, 1];

/**
 * Moving between steps: the old step leaves the way you came, the new one arrives from where you are going.
 * With reduced motion the content is swapped with no movement.
 */
export const StepTransition: React.FC<StepTransitionProps> = ({ stepKey, direction, children }) => {
  const reduced = useReducedMotion();
  const offset = reduced ? 0 : 12 * direction;
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={stepKey}
        initial={{ opacity: 0, x: offset }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -offset }}
        transition={{ duration: reduced ? 0 : 0.22, ease: EASE_OUT_CUBIC }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
};
