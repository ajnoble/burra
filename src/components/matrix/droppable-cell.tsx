"use client";

import { useDroppable } from "@dnd-kit/core";
import { cn } from "@/lib/utils";

type Props = {
  bedId: string;
  date: string;
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
  onClick?: () => void;
  "aria-label"?: string;
};

/**
 * A droppable cell in the booking matrix. Drop ID: `${bedId}:${date}`.
 * Highlights with a ring when a draggable is hovering over it.
 */
export function DroppableCell({
  bedId,
  date,
  className,
  style,
  children,
  onClick,
  "aria-label": ariaLabel,
}: Props) {
  const { setNodeRef, isOver } = useDroppable({
    id: `${bedId}:${date}`,
    data: { bedId, date },
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(className, isOver && "ring-2 ring-inset ring-primary")}
      style={style}
      onClick={onClick}
      aria-label={ariaLabel}
    >
      {children}
    </div>
  );
}
