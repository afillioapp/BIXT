import { useRef, useState } from "react";

// Lets a period view (the activity squares, the spending chart) be dragged
// sideways: the content follows the finger, and past a third of its width (or
// a quick flick) it slides out, the period changes, and the new one slides in
// from the other side. Short drags spring back. Owner request 2026-10-25.
//
// onStep(+1) = one period back (drag right), onStep(-1) = one forward (drag
// left). canForward=false (already at the current period) turns a left drag
// into a short rubber-band that springs back.
//
// Only the horizontal axis is clipped, so tap bubbles above the squares still
// show; vertical page scrolling is left to the browser (touch-action pan-y).

const SLIDE_MS = 220;

export default function SwipeSlide({ onStep, canForward = true, children, className = "", innerClassName = "" }) {
  const [x, setX] = useState(0);
  const [animate, setAnimate] = useState(false);
  const boxRef = useRef(null);
  const drag = useRef(null);
  const busy = useRef(false);
  // The live drag distance. A ref, not just state: touchend can arrive before
  // React re-renders, and must see the distance the finger actually moved.
  const xRef = useRef(0);

  function moveTo(v) {
    xRef.current = v;
    setX(v);
  }

  function onTouchStart(e) {
    if (busy.current) return;
    const t = e.touches[0];
    drag.current = { x: t.clientX, y: t.clientY, t: Date.now(), axis: null };
    setAnimate(false);
  }

  function onTouchMove(e) {
    const d = drag.current;
    if (!d) return;
    const t = e.touches[0];
    const dx = t.clientX - d.x;
    const dy = t.clientY - d.y;
    if (!d.axis) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      d.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
    }
    if (d.axis !== "x") return;
    // Rubber-band when there is nothing further forward.
    moveTo(dx < 0 && !canForward ? dx / 4 : dx);
  }

  function settle(to, then) {
    setAnimate(true);
    moveTo(to);
    window.setTimeout(then, SLIDE_MS);
  }

  function onTouchEnd() {
    const d = drag.current;
    drag.current = null;
    if (!d || d.axis !== "x") return;
    const width = boxRef.current?.offsetWidth || 300;
    const dx = xRef.current;
    const fast = Math.abs(dx) > 30 && Date.now() - d.t < 250;
    const dir = dx > 0 ? 1 : -1; // +1 = back in time
    if ((Math.abs(dx) > width / 3 || fast) && (dir === 1 || canForward)) {
      busy.current = true;
      settle(dir * width, () => {
        onStep(dir);
        // New period enters from the opposite side.
        setAnimate(false);
        moveTo(-dir * width);
        requestAnimationFrame(() =>
          requestAnimationFrame(() =>
            settle(0, () => {
              busy.current = false;
            })
          )
        );
      });
    } else {
      settle(0, () => {});
    }
  }

  return (
    <div ref={boxRef} className={className} style={{ overflowX: "clip", touchAction: "pan-y" }}>
      <div
        className={innerClassName}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
        style={{
          transform: `translateX(${x}px)`,
          transition: animate ? `transform ${SLIDE_MS}ms cubic-bezier(.2,.7,.3,1)` : "none",
        }}
      >
        {children}
      </div>
    </div>
  );
}
