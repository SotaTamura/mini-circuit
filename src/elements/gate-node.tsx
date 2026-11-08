import { useLayoutEffect, useRef, useState } from "react";
import { Handle, Position } from "@xyflow/react";
import andIcon from "../assets/and.svg";
import orIcon from "../assets/or.svg";
import notIcon from "../assets/not.svg";
import nandIcon from "../assets/nand.svg";
import norIcon from "../assets/nor.svg";
import xorIcon from "../assets/xor.svg";
import xnorIcon from "../assets/xnor.svg";

type GateNodeProps = {
  icon: string;
  curvedInput?: boolean;
};

export default function GateNode({ icon, curvedInput = false }: GateNodeProps) {
  const nodeRef = useRef<HTMLDivElement>(null);
  const iconRef = useRef<HTMLImageElement>(null);
  const [iconOffset, setIconOffset] = useState(0);

  useLayoutEffect(() => {
    const node = nodeRef.current;
    const symbol = iconRef.current;
    if (node && symbol) {
      setIconOffset((node.clientWidth - symbol.clientWidth) / 2);
    }
  }, [icon]);

  return (
    <div
      ref={nodeRef}
      className="relative flex h-[72px] w-[95px] items-center justify-center text-[#1f2937]"
    >
      <Handle
        type="target"
        position={Position.Left}
        id="input"
        style={{
          left: iconOffset + (curvedInput ? 12 : 0),
          top: "50%",
        }}
      />
      <img
        ref={iconRef}
        className="pointer-events-none block h-[54.5px] w-auto"
        src={icon}
        alt=""
        draggable={false}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="output"
        style={{ right: iconOffset }}
      />
    </div>
  );
}

export function AndNode() {
  return <GateNode icon={andIcon} />;
}
export function OrNode() {
  return <GateNode icon={orIcon} curvedInput />;
}
export function NotNode() {
  return <GateNode icon={notIcon} />;
}
export function NandNode() {
  return <GateNode icon={nandIcon} />;
}
export function NorNode() {
  return <GateNode icon={norIcon} curvedInput />;
}
export function XorNode() {
  return <GateNode icon={xorIcon} curvedInput />;
}
export function XnorNode() {
  return <GateNode icon={xnorIcon} curvedInput />;
}
