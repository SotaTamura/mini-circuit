import { Handle, Position, type NodeProps } from "@xyflow/react";

type Port = { id: string; label?: string };

export type SavedComponent = {
  id: string;
  name: string;
  nodes: import("@xyflow/react").Node[];
  edges: import("@xyflow/react").Edge[];
  inputs: Port[];
  outputs: Port[];
  sourceSeedNodeId?: string;
};

export function ComponentNode({ data }: NodeProps) {
  const component = data.component as SavedComponent;
  const inputs = component?.inputs ?? [];
  const outputs = component?.outputs ?? [];
  const portTop = (index: number, count: number) =>
    `${((index + 1) / (count + 1)) * 100}%`;

  return (
    <div className="relative flex h-[132px] w-[132px] items-center justify-center rounded-md border-2 border-gray-800 bg-white text-sm font-semibold text-gray-800">
      <span
        className="max-w-[82px] truncate text-center"
        title={component?.name}
      >
        {component?.name}
      </span>
      {inputs.map((port, index) => (
        <div
          key={port.id}
          className="absolute left-0"
          style={{ top: portTop(index, inputs.length) }}
        >
          <Handle
            type="target"
            position={Position.Left}
            id={`input:${port.id}`}
          />
          <span
            className="absolute left-[10px] top-[-9px] w-8 text-left"
            title={port.label || "IN"}
          >
            {port.label || "IN"}
          </span>
        </div>
      ))}
      {outputs.map((port, index) => (
        <div
          key={port.id}
          className="absolute right-0"
          style={{ top: portTop(index, outputs.length) }}
        >
          <Handle
            type="source"
            position={Position.Right}
            id={`output:${port.id}`}
          />
          <span
            className="absolute right-[10px] top-[-9px] w-8 text-right"
            title={port.label || "OUT"}
          >
            {port.label || "OUT"}
          </span>
        </div>
      ))}
    </div>
  );
}
