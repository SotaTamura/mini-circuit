import { useState } from "react";
import { Handle, Position, type NodeProps, useReactFlow } from "@xyflow/react";
import { useCircuit } from "../context/circuit-context";

export function InputNode({ id, data }: NodeProps) {
  const { toggleInputValue } = useCircuit();
  const { updateNodeData } = useReactFlow();
  const [label, setLabel] = useState(
    typeof data?.label === "string" ? data.label : "IN",
  );
  const value = (data?.value as boolean) ?? false;

  return (
    <div className="relative inline-flex items-center p-0 m-0 select-none w-fit">
      <input
        type="text"
        value={label}
        onChange={(e) => {
          setLabel(e.target.value);
          updateNodeData(id, { label: e.target.value });
        }}
        className="nodrag nopan h-12 field-sizing-content text-center text-xl font-bold text-gray-700 bg-transparent rounded px-1.5 py-1 hover:border hover:border-gray-400 focus:border-blue-500 focus:outline-none"
        placeholder="IN"
      />
      <div
        className={`relative flex items-center justify-center w-12 h-12 border-2 border-gray-800 rounded cursor-pointer ${value ? "bg-lime-500" : "bg-white"}`}
        onClick={() => {
          toggleInputValue(id);
        }}
      >
        <span className="font-mono text-xl font-bold text-gray-900">
          {Number(value)}
        </span>
        <Handle type="source" position={Position.Right} id="output" />
      </div>
    </div>
  );
}

export function OutputNode({ id, data }: NodeProps) {
  const { updateNodeData } = useReactFlow();
  const [label, setLabel] = useState(
    typeof data?.label === "string" ? data.label : "OUT",
  );
  const value = (data?.value as boolean) ?? false;
  const isOscillating = Boolean(data?.isOscillating);

  return (
    <div className="relative inline-flex items-center p-0 m-0 select-none w-fit">
      <div
        className={`relative flex items-center justify-center w-12 h-12 border-2 border-gray-800 rounded ${isOscillating ? "bg-red-500 text-white" : value ? "bg-lime-500 text-gray-900" : "bg-white text-gray-900"}`}
      >
        <Handle type="target" position={Position.Left} id="input" />
        <span className="font-mono text-xl font-bold">
          {isOscillating ? "!" : Number(value)}
        </span>
      </div>
      <input
        type="text"
        value={label}
        onChange={(e) => {
          setLabel(e.target.value);
          updateNodeData(id, { label: e.target.value });
        }}
        className="nodrag nopan h-12 field-sizing-content text-center text-xl font-bold text-gray-700 bg-transparent rounded px-1.5 py-1 hover:border hover:border-gray-400 focus:border-blue-500 focus:outline-none"
        placeholder="OUT"
      />
    </div>
  );
}
