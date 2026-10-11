import type { KeyboardEvent } from "react";

export function checkListArrowKeys(e: KeyboardEvent<HTMLElement>, extend: (ids: string[], checked: boolean) => void) {
  if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
  const boxes = [...e.currentTarget.querySelectorAll<HTMLInputElement>("input[type=checkbox][data-id]:not(:disabled)")];
  const index = boxes.indexOf(document.activeElement as HTMLInputElement);
  if (index < 0) return;
  const target = boxes[index + (e.key === "ArrowDown" ? 1 : -1)];
  if (!target) return;
  e.preventDefault();
  target.focus();
  if (e.shiftKey) extend([boxes[index].dataset.id ?? "", target.dataset.id ?? ""].filter(Boolean), !(e.ctrlKey || e.metaKey));
}
