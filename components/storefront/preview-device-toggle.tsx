export type PreviewDevice = "mobile" | "tablet" | "desktop";

export const DEVICE_WIDTHS: Record<PreviewDevice, number> = {
  mobile: 390,
  tablet: 768,
  desktop: 1280,
};

const DEVICES: { key: PreviewDevice; label: string; icon: string }[] = [
  { key: "mobile", label: "Mobile", icon: "▯" },
  { key: "tablet", label: "Tablet", icon: "▭" },
  { key: "desktop", label: "Desktop", icon: "▬" },
];

interface Props {
  value: PreviewDevice;
  onChange: (device: PreviewDevice) => void;
}

export default function PreviewDeviceToggle({ value, onChange }: Props) {
  return (
    <div className="inline-flex rounded border border-gray-300 bg-white p-0.5">
      {DEVICES.map((d) => (
        <button
          key={d.key}
          type="button"
          onClick={() => onChange(d.key)}
          aria-label={d.label}
          className={`px-3 py-1 text-xs font-medium ${
            value === d.key
              ? "rounded bg-black text-white"
              : "text-gray-600 hover:text-black"
          }`}
        >
          <span className="mr-1">{d.icon}</span>
          {d.label}
        </button>
      ))}
    </div>
  );
}
