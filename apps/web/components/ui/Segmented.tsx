"use client";

/** A row of mutually exclusive options, e.g. Technical / Plain. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <fieldset aria-label={label} className="inline-flex border border-rule text-[13px]">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={`px-3 py-1 ${value === o.value ? "bg-raise text-text" : "text-stone hover:text-text"}`}
        >
          {o.label}
        </button>
      ))}
    </fieldset>
  );
}
