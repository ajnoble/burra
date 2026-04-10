"use client";

import Image from "next/image";
import { useOrgTheme } from "@/lib/theme/org-theme-context";
import { cn } from "@/lib/utils";

type Props = {
  className?: string;
  imageClassName?: string;
  wordmarkClassName?: string;
  priority?: boolean;
};

export function OrgLogo({
  className,
  imageClassName,
  wordmarkClassName,
  priority = false,
}: Props) {
  const { logoUrl, name } = useOrgTheme();

  if (logoUrl) {
    return (
      <div className={cn("flex items-center", className)}>
        <Image
          src={logoUrl}
          alt={name}
          width={160}
          height={40}
          priority={priority}
          className={cn("h-auto w-auto max-h-10 object-contain", imageClassName)}
          unoptimized
        />
      </div>
    );
  }

  return (
    <span
      className={cn(
        "font-display text-xl font-medium tracking-tight text-foreground",
        wordmarkClassName,
        className
      )}
    >
      {name}
    </span>
  );
}
