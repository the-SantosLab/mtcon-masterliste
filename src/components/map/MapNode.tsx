import { Handle, Position, type NodeProps } from "@xyflow/react";
import { KIND_LABEL, type MapNodeData } from "@/lib/map/buildGraph";

export function MapNode({ data, selected }: NodeProps) {
  const d = data as unknown as MapNodeData;
  const color = d.color;
  const label = d.kind === "custom" ? (d.customKind || "SYSTEM").toUpperCase() : KIND_LABEL[d.kind];

  return (
    <div
      className="relative rounded-xl backdrop-blur-xl transition-transform hover:scale-[1.03]"
      style={{
        width: 200,
        background: "hsl(230 40% 10% / 0.78)",
        border: `1px solid hsl(${color} / ${selected ? 0.9 : 0.4})`,
        boxShadow: selected
          ? `0 0 0 1px hsl(${color} / 0.6), 0 0 30px hsl(${color} / 0.55), inset 0 0 22px hsl(${color} / 0.18)`
          : `0 0 18px hsl(${color} / 0.22), inset 0 0 14px hsl(${color} / 0.08)`,
      }}
    >
      <Handle type="target" position={Position.Left} style={{ opacity: 0, pointerEvents: "none" }} />
      <Handle type="source" position={Position.Right} style={{ opacity: 0, pointerEvents: "none" }} />

      <div className="px-3 pt-2.5 pb-2">
        <div
          className="text-[9px] font-semibold tracking-[0.25em]"
          style={{ color: `hsl(${color})` }}
        >
          {label}
        </div>
        <div className="mt-1 text-[12px] font-semibold leading-tight text-white truncate">{d.title}</div>
        {d.subtitle ? (
          <div className="mt-0.5 text-[10px] text-white/45 truncate">{d.subtitle}</div>
        ) : null}
      </div>
    </div>
  );
}
