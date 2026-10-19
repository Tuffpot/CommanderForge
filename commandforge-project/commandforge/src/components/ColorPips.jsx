import { COLOR_META } from "../lib/colors";

export default function ColorPips({ identity, size = "md" }) {
  const s = size === "sm" ? "w-5 h-5 text-[10px]" : "w-6 h-6 text-[11px]";
  return (
    <div className="flex gap-1.5 shrink-0">
      {identity.map((c) => (
        <span
          key={c}
          title={COLOR_META[c].label}
          className={`${s} rounded-full border-2 border-black/40 flex items-center justify-center font-bold shadow`}
          style={{ backgroundColor: COLOR_META[c].swatch, color: "#1a1225" }}
        >
          {c}
        </span>
      ))}
    </div>
  );
}
