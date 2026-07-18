import { useEffect, useRef, useState } from "react";
import { MoreHorizontal, ReceiptText, Pencil, Trash2 } from "lucide-react";
import CategoryIcon from "./CategoryIcon";

// Swipe-to-act expense row (owner request, modeled on CamScanner's
// swipe-reveal row actions). One shared component for both Home's Recent
// Expenses list (pages/index.js) and History's grouped list
// (pages/history.js) so the row visuals + swipe behavior never drift apart.
//
// Content (CategoryIcon tinted square, vendor + category, right-aligned
// amount) is unchanged from the plain <a> row it replaces. Dragging the
// content left (touch or mouse) reveals three equal action buttons behind
// it: Receipt (open receiptLink), Edit (calls onEdit), Delete (asks to
// confirm, then calls onDelete). Tapping the content while closed opens the
// receipt link (old behavior); tapping it while open closes the row.
//
// Only one row is ever open at a time: the parent owns "which row id is
// open" (openId) and is told when that changes (onOpenChange), rather than
// each row tracking its own open/closed independently.

const ACTION_WIDTH = 64;
const MAX_OPEN = ACTION_WIDTH * 3; // 192px — three equal action slots
const OPEN_THRESHOLD = MAX_OPEN / 2;
const DRAG_SLOP = 4; // px of movement before a touch/click counts as a drag, not a tap

// Same stable per-category tint approach both pages used inline before this
// component existed (design's bg-*-50/text-*-600 pairs, hashed per category
// so a category always renders the same swatch).
const TINTS = [
  "bg-brand-teal-soft text-brand-teal",
  "bg-orange-50 text-orange-600",
  "bg-indigo-50 text-indigo-600",
  "bg-zinc-100 text-zinc-700",
  "bg-amber-50 text-amber-600",
  "bg-rose-50 text-rose-500",
  "bg-sky-50 text-sky-600",
  "bg-emerald-50 text-emerald-600",
];

function tintForCategory(category) {
  const key = category || "Other";
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return TINTS[hash % TINTS.length];
}

export function rowIdFor(row) {
  return `${row.sheetId || ""}:${row.rowIndex ?? ""}`;
}

export default function ExpenseRow({ row, openId, onOpenChange, onEdit, onDelete }) {
  const id = rowIdFor(row);
  const isOpen = openId === id;

  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const offsetRef = useRef(0);
  const dragState = useRef({ startX: 0, startOffset: 0, moved: false, active: false });

  useEffect(() => {
    offsetRef.current = offset;
  }, [offset]);

  // Some other row opened (or everything closed) — snap this one shut.
  useEffect(() => {
    if (!isOpen) {
      setOffset(0);
      setConfirmingDelete(false);
    }
  }, [isOpen]);

  function closeRow() {
    setOffset(0);
    onOpenChange(null);
  }

  function beginDrag(clientX) {
    dragState.current = { startX: clientX, startOffset: offsetRef.current, moved: false, active: true };
    setDragging(true);
  }

  function moveDrag(clientX) {
    if (!dragState.current.active) return;
    const delta = dragState.current.startX - clientX; // positive = dragging left (opening)
    if (Math.abs(delta) > DRAG_SLOP) dragState.current.moved = true;
    const next = Math.max(0, Math.min(MAX_OPEN, dragState.current.startOffset + delta));
    setOffset(next);
  }

  function endDrag() {
    if (!dragState.current.active) return;
    dragState.current.active = false;
    setDragging(false);

    if (dragState.current.moved) {
      const shouldOpen = offsetRef.current > OPEN_THRESHOLD;
      setOffset(shouldOpen ? MAX_OPEN : 0);
      onOpenChange(shouldOpen ? id : null);
      return;
    }

    // No real drag distance — treat as a tap on the row content. Tapping
    // only closes an open row; the receipt is reachable via the swipe
    // action alone (owner request — tap-to-open removed).
    if (isOpen) {
      closeRow();
    }
  }

  // Mouse support (desktop testing): once a drag starts on the content div,
  // track movement/release on the window so releasing outside the row still
  // ends the drag.
  useEffect(() => {
    if (!dragging) return;
    function onMove(e) {
      moveDrag(e.clientX);
    }
    function onUp() {
      endDrag();
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragging]);

  async function handleConfirmDelete(e) {
    e.stopPropagation();
    setDeleting(true);
    try {
      await onDelete(row);
      // On success the parent refreshes and this row unmounts — no local
      // reset needed.
    } catch {
      // Parent surfaces the error; leave the confirm state up so the user
      // can retry or cancel.
      setDeleting(false);
    }
  }

  const tint = tintForCategory(row.category);

  return (
    <li className="relative rounded-xl overflow-hidden ring-1 ring-black/5">
      {/* Action layer — sharp-cornered, revealed as the content slides left.
          Clipped to the outer rounded-xl by the li's overflow-hidden. */}
      <div className="absolute inset-y-0 right-0 flex" style={{ width: MAX_OPEN }}>
        <button
          type="button"
          disabled={!row.receiptLink}
          onClick={(e) => {
            e.stopPropagation();
            if (!row.receiptLink) return;
            window.open(row.receiptLink, "_blank", "noopener,noreferrer");
            closeRow();
          }}
          className="flex-1 flex flex-col items-center justify-center gap-1 bg-zinc-500 text-white text-[10px] font-medium disabled:opacity-40"
        >
          <ReceiptText className="size-4" />
          Receipt
        </button>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onEdit(row);
            closeRow();
          }}
          className="flex-1 flex flex-col items-center justify-center gap-1 bg-brand-teal text-white text-[10px] font-medium"
        >
          <Pencil className="size-4" />
          Edit
        </button>

        {!confirmingDelete ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setConfirmingDelete(true);
            }}
            className="flex-1 flex flex-col items-center justify-center gap-1 bg-destructive text-white text-[10px] font-medium"
          >
            <Trash2 className="size-4" />
            Delete
          </button>
        ) : (
          <div className="flex-1 flex">
            <button
              type="button"
              onClick={handleConfirmDelete}
              disabled={deleting}
              className="flex-1 bg-destructive text-white text-[10px] font-semibold disabled:opacity-60"
            >
              {deleting ? "…" : "Delete?"}
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setConfirmingDelete(false);
              }}
              disabled={deleting}
              className="flex-1 bg-zinc-600 text-white text-[10px] font-semibold disabled:opacity-60"
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {/* Content layer — slides left to reveal the actions behind it. */}
      <div
        className="relative z-10 flex items-center justify-between p-3 bg-white select-none"
        style={{
          transform: `translateX(-${offset}px)`,
          transition: dragging ? "none" : "transform 200ms ease-out",
          touchAction: "pan-y",
        }}
        onTouchStart={(e) => beginDrag(e.touches[0].clientX)}
        onTouchMove={(e) => moveDrag(e.touches[0].clientX)}
        onTouchEnd={endDrag}
        onMouseDown={(e) => beginDrag(e.clientX)}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className={`size-10 rounded-lg grid place-items-center shrink-0 ${tint}`}>
            <CategoryIcon category={row.category} className="size-4" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{row.place || "Untitled"}</p>
            <p className="text-[11px] text-text-secondary truncate">{row.category || "Other"}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <p className="text-sm font-semibold text-text-primary">-{row.total}</p>
          <MoreHorizontal className="size-4 text-zinc-400" />
        </div>
      </div>
    </li>
  );
}
