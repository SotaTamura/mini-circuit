import { Handle, Position, type NodeProps } from "@xyflow/react";

export function ClockNode({ data }: NodeProps) {
  const value = Boolean(data?.value);
  const frequency = Number(data?.hz) || 1;

  return (
    <div
      className={`relative flex h-12 w-16 items-center justify-center rounded border-2 border-gray-800 font-mono text-lg font-bold text-gray-900 ${value ? "bg-lime-500" : "bg-white"}`}
      title={`${frequency} Hz`}
    >
      CLK
      <Handle type="source" position={Position.Right} id="output" />
    </div>
  );
}
