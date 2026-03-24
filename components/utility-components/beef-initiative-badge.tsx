import Image from "next/image";

export default function BeefInitiativeBadge({
  size = "sm",
}: {
  size?: "sm" | "md";
}) {
  const isMd = size === "md";

  return (
    <a
      href="https://beefinitiative.com"
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className={`inline-flex items-center gap-1.5 rounded-md border-2 border-black bg-[#1a1a1a] shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all hover:-translate-y-0.5 hover:shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] ${
        isMd ? "px-3 py-1.5" : "px-2 py-1"
      }`}
      title="This purchase supports the Beef Initiative"
    >
      <Image
        src="/beef-initiative-logo.png"
        alt="Beef Initiative"
        width={isMd ? 20 : 16}
        height={isMd ? 20 : 16}
        className="object-contain"
      />
      <span
        className={`font-bold tracking-wide text-white ${
          isMd ? "text-xs" : "text-[10px]"
        }`}
      >
        BEEF INITIATIVE
      </span>
    </a>
  );
}
