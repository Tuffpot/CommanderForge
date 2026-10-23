import { ImageOff } from "lucide-react";

export function PreviewImage({ imageUrl, name }) {
  if (!imageUrl) {
    return (
      <div className="w-full max-h-[60vh] aspect-[5/7] rounded-xl mb-4 bg-white/5 border border-white/10 flex flex-col items-center justify-center gap-2 text-parchment/30">
        <ImageOff size={28} />
        <span className="text-xs">Image unavailable</span>
      </div>
    );
  }
  return <img src={imageUrl} alt={name} className="w-full max-h-[60vh] object-contain rounded-xl mb-4" />;
}

export function CommanderArt({ imageUrl }) {
  if (!imageUrl) {
    return (
      <div className="w-56 sm:w-64 aspect-[5/7] rounded-lg shrink-0 bg-white/5 border border-white/10 flex items-center justify-center text-parchment/20">
        <ImageOff size={48} />
      </div>
    );
  }
  return <img src={imageUrl} alt="" className="w-56 sm:w-64 rounded-lg shrink-0 border border-white/10 shadow-lg" />;
}
