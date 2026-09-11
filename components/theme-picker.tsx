"use client";

import { useEffect, useState } from "react";
import { ChevronDown, Palette } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const themes = [
  { id: "clinical", name: "Clinical", swatches: ["#2456dc", "#eef3ff"] },
  { id: "ocean", name: "Ocean", swatches: ["#087f8c", "#e4f5f4"] },
  { id: "orchid", name: "Orchid", swatches: ["#7357c7", "#f2edff"] },
  { id: "midnight", name: "Midnight", swatches: ["#78a7ff", "#14213a"] },
] as const;

type ThemeId = (typeof themes)[number]["id"];

function isTheme(value: string | null): value is ThemeId {
  return themes.some((theme) => theme.id === value);
}

export function ThemePicker() {
  const [theme, setTheme] = useState<ThemeId>("clinical");

  useEffect(() => {
    const stored = localStorage.getItem("carecloud-theme");
    const initial = isTheme(stored) ? stored : "clinical";
    document.documentElement.dataset.theme = initial;
    setTheme(initial);
  }, []);

  function selectTheme(value: string) {
    if (!isTheme(value)) return;
    document.documentElement.dataset.theme = value;
    localStorage.setItem("carecloud-theme", value);
    setTheme(value);
  }

  const selected = themes.find((item) => item.id === theme) ?? themes[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="theme-trigger" aria-label="Choose theme">
        <Palette size={17} />
        <span>{selected.name}</span>
        <ChevronDown size={14} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="theme-menu">
        <DropdownMenuLabel>Interface theme</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={theme} onValueChange={selectTheme}>
          {themes.map((item) => (
            <DropdownMenuRadioItem key={item.id} value={item.id}>
              <span className="theme-swatches" aria-hidden="true">
                {item.swatches.map((color) => (
                  <i key={color} style={{ background: color }} />
                ))}
              </span>
              {item.name}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
