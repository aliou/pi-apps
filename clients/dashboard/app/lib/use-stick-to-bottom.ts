import { useCallback, useEffect, useRef, useState } from "react";

const BOTTOM_THRESHOLD_PX = 80;

/**
 * Minimal stick-to-bottom hook for chat views.
 *
 * - Tracks whether the user is near the bottom of a scroll container.
 * - When new content arrives (ResizeObserver) and the user WAS at the bottom,
 *   scrolls to bottom automatically.
 * - Does NOT scroll on mount or when the container becomes visible.
 * - Exposes `isAtBottom` and `scrollToBottom` for a manual scroll button.
 */
export function useStickToBottom() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const isAtBottomRef = useRef(true);
  // Tracks whether content has ever been taller than the viewport.
  // Prevents auto-scroll on first render / visibility change.
  const hasOverflowedRef = useRef(false);

  const checkAndUpdate = useCallback(() => {
    const el = scrollRef.current;
    if (!el || el.clientHeight === 0) return; // hidden/collapsed
    const distanceFromBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight;
    const atBottom = distanceFromBottom <= BOTTOM_THRESHOLD_PX;
    isAtBottomRef.current = atBottom;
    setIsAtBottom(atBottom);
  }, []);

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, []);

  // Track scroll position
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    // Check initial position after layout settles
    requestAnimationFrame(() => checkAndUpdate());

    const onScroll = () => checkAndUpdate();

    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [checkAndUpdate]);

  // Auto-scroll when content grows, but only if already at bottom
  useEffect(() => {
    const content = contentRef.current;
    const scroll = scrollRef.current;
    if (!content || !scroll) return;

    let previousHeight: number | undefined;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const wasAtBottom = isAtBottomRef.current;
      const height = entry.contentRect.height;
      const grew = previousHeight !== undefined && height > previousHeight;
      previousHeight = height;

      // Track if content has ever overflowed (scrollable)
      if (scroll.scrollHeight > scroll.clientHeight) {
        hasOverflowedRef.current = true;
      }

      // Update isAtBottom state on resize
      checkAndUpdate();

      // Only auto-scroll if content grew, user was near bottom before growth,
      // and we've seen overflow before (not first paint).
      if (grew && wasAtBottom && hasOverflowedRef.current) {
        requestAnimationFrame(() => {
          scrollRef.current?.scrollTo({
            top: scrollRef.current.scrollHeight,
            behavior: "smooth",
          });
        });
      }
    });

    observer.observe(content);
    return () => observer.disconnect();
  }, [checkAndUpdate]);

  return { scrollRef, contentRef, isAtBottom, scrollToBottom };
}
