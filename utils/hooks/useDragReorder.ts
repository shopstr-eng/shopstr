import { useRef, useState, useCallback } from "react";

interface ItemProps {
  rootProps: {
    onDragOver: (e: React.DragEvent) => void;
    onDrop: (e: React.DragEvent) => void;
    onDragLeave: (e: React.DragEvent) => void;
  };
  handleProps: {
    draggable: true;
    onDragStart: (e: React.DragEvent) => void;
    onDragEnd: (e: React.DragEvent) => void;
    style: React.CSSProperties;
    "aria-label": string;
    title: string;
  };
  isDragging: boolean;
  isDragOver: boolean;
}

export function useDragReorder<T>(
  items: T[],
  onChange: (next: T[]) => void
): {
  getItemProps: (idx: number) => ItemProps;
  isReordering: boolean;
} {
  const fromIdxRef = useRef<number | null>(null);
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);

  const getItemProps = useCallback(
    (idx: number): ItemProps => ({
      rootProps: {
        onDragOver: (e: React.DragEvent) => {
          if (fromIdxRef.current === null) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          if (overIdx !== idx) setOverIdx(idx);
        },
        onDragLeave: () => {
          if (overIdx === idx) setOverIdx(null);
        },
        onDrop: (e: React.DragEvent) => {
          e.preventDefault();
          const from = fromIdxRef.current;
          fromIdxRef.current = null;
          setDraggingIdx(null);
          setOverIdx(null);
          if (from === null || from === idx) return;
          if (from < 0 || from >= items.length) return;
          const next = [...items];
          const [moved] = next.splice(from, 1);
          next.splice(idx, 0, moved!);
          onChange(next);
        },
      },
      handleProps: {
        draggable: true,
        onDragStart: (e: React.DragEvent) => {
          fromIdxRef.current = idx;
          setDraggingIdx(idx);
          e.dataTransfer.effectAllowed = "move";
          try {
            e.dataTransfer.setData("text/plain", String(idx));
          } catch {
            /* noop */
          }
        },
        onDragEnd: () => {
          fromIdxRef.current = null;
          setDraggingIdx(null);
          setOverIdx(null);
        },
        style: { cursor: "grab", touchAction: "none" },
        "aria-label": "Drag to reorder",
        title: "Drag to reorder",
      },
      isDragging: draggingIdx === idx,
      isDragOver:
        overIdx === idx && draggingIdx !== null && draggingIdx !== idx,
    }),
    [items, onChange, draggingIdx, overIdx]
  );

  return { getItemProps, isReordering: draggingIdx !== null };
}
