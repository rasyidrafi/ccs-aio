import type { DatePreset, TrendGranularityInput } from "@/lib/types";

export function getGranularityOptions(
  preset: DatePreset
): Array<{ value: TrendGranularityInput; label: string }> {
  const common = [{ value: "auto" as const, label: "Auto" }];

  if (preset === "today") {
    return [
      ...common,
      { value: "hourly", label: "Hourly" },
      { value: "daily", label: "Daily" },
    ];
  }

  if (preset === "week") {
    return [
      ...common,
      { value: "daily", label: "Daily" },
      { value: "weekly", label: "Weekly" },
    ];
  }

  return [
    ...common,
    { value: "daily", label: "Daily" },
    { value: "weekly", label: "Weekly" },
    { value: "monthly", label: "Monthly" },
    { value: "yearly", label: "Yearly" },
  ];
}
