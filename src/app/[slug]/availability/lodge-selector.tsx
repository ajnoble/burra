"use client";

import { useRouter } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Lodge = { id: string; name: string; totalBeds: number };

type Props = {
  lodges: Lodge[];
  selectedLodgeId: string;
  slug: string;
};

export function LodgeSelector({ lodges, selectedLodgeId, slug }: Props) {
  const router = useRouter();

  function handleChange(lodgeId: string | null) {
    if (!lodgeId) return;
    const params = new URLSearchParams({ lodge: lodgeId });
    router.push(`/${slug}/availability?${params.toString()}`);
  }

  return (
    <Select value={selectedLodgeId} onValueChange={handleChange}>
      <SelectTrigger>
        <SelectValue placeholder="Select lodge" />
      </SelectTrigger>
      <SelectContent>
        {lodges.map((lodge) => (
          <SelectItem key={lodge.id} value={lodge.id}>
            {lodge.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
