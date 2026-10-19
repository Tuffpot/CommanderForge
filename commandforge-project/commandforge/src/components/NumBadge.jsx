export default function NumBadge({ n }) {
  return (
    <span className="w-9 h-9 rounded-lg bg-purple-500/20 border border-purple-400/40 text-purple-200 font-bold flex items-center justify-center text-sm shrink-0">
      {n}
    </span>
  );
}
