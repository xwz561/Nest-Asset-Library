import { cloneElement, isValidElement, useEffect, useRef, useState } from "react";

const ENTER_TIMEOUT_MS = 270;
const LEAVE_TIMEOUT_MS = 210;

export function PresenceTransition({ show, kind, children }) {
  const [phase, setPhase] = useState(() => show ? "entering" : "unmounted");
  const showRef = useRef(show);
  const lastChildRef = useRef(null);
  showRef.current = show;

  const reducedMotion = typeof window !== "undefined"
    && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  let visiblePhase = phase;
  if (reducedMotion) {
    visiblePhase = show ? "entered" : "unmounted";
  } else if (show && (phase === "unmounted" || phase === "leaving")) {
    visiblePhase = "entering";
  } else if (!show && phase !== "unmounted") {
    visiblePhase = "leaving";
  }

  useEffect(() => {
    if (reducedMotion) {
      setPhase(show ? "entered" : "unmounted");
      return undefined;
    }

    if (show && (phase === "unmounted" || phase === "leaving")) {
      setPhase("entering");
      return undefined;
    }
    if (!show && (phase === "entering" || phase === "entered")) {
      setPhase("leaving");
      return undefined;
    }
    if (phase !== "entering" && phase !== "leaving") return undefined;

    const timeout = window.setTimeout(() => {
      if (phase === "entering" && showRef.current) setPhase("entered");
      if (phase === "leaving" && !showRef.current) setPhase("unmounted");
    }, phase === "entering" ? ENTER_TIMEOUT_MS : LEAVE_TIMEOUT_MS);
    return () => window.clearTimeout(timeout);
  }, [show, phase, reducedMotion]);

  if (visiblePhase === "unmounted") {
    lastChildRef.current = null;
    return null;
  }

  const onAnimationEnd = (event) => {
    if (event.target !== event.currentTarget) return;
    if (visiblePhase === "entering" && showRef.current) setPhase("entered");
    if (visiblePhase === "leaving" && !showRef.current) setPhase("unmounted");
  };
  const presenceProps = {
    "data-motion-phase": visiblePhase,
    "data-motion-kind": kind,
    "aria-hidden": visiblePhase === "leaving" ? true : undefined,
    inert: visiblePhase === "leaving" ? true : undefined,
    onAnimationEnd,
  };
  const child = children({ phase: visiblePhase, presenceProps });
  if (child != null) {
    lastChildRef.current = child;
    return child;
  }

  const cachedChild = lastChildRef.current;
  if (!isValidElement(cachedChild)) return cachedChild;
  return cloneElement(
    cachedChild,
    typeof cachedChild.type === "string" ? presenceProps : { presenceProps },
  );
}
