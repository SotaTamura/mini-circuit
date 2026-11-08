import type { Node, Edge } from "@xyflow/react";

/**
 * 各論理ゲートの出力を計算する関数
 */
export function evaluateGate(
  type: string | undefined,
  inputs: boolean[],
): boolean {
  switch (type) {
    case "and":
      return inputs.length > 0 && inputs.every(Boolean);
    case "or":
      return inputs.some(Boolean);
    case "not":
      return !(inputs[0] ?? false);
    case "nand":
      return !(inputs.length > 0 && inputs.every(Boolean));
    case "nor":
      return !inputs.some(Boolean);
    case "xor":
      return inputs.filter(Boolean).length % 2 === 1;
    case "xnor":
      return inputs.filter(Boolean).length % 2 === 0;
    case "output":
      return inputs.some(Boolean);
    case "buffer":
      return inputs[0] ?? false;
    default:
      return false;
  }
}

type ComponentDefinition = {
  nodes: Node[];
  edges: Edge[];
  inputs: { id: string }[];
  outputs: { id: string }[];
};

type ExpandedCircuit = {
  nodes: Node[];
  edges: Edge[];
  nodeIds: Map<string, string>;
  componentInputs: Map<string, Map<string, string>>;
  componentOutputs: Map<string, Map<string, string>>;
  hasComponents: boolean;
};

function expandComponents(nodes: Node[], edges: Edge[]): ExpandedCircuit {
  const expandedNodes: Node[] = [];
  const expandedEdges: Edge[] = [];
  const nodeIds = new Map<string, string>();
  const componentInputs = new Map<string, Map<string, string>>();
  const componentOutputs = new Map<string, Map<string, string>>();
  let hasComponents = false;

  const expandLevel = (
    levelNodes: Node[],
    levelEdges: Edge[],
    idPrefix: string,
    exposedInputIds: Set<string>,
  ): {
    nodeIds: Map<string, string>;
    endpoints: Map<string, {
      nodeId?: string;
      inputs?: Map<string, string>;
      outputs?: Map<string, string>;
    }>;
  } => {
    const localNodeIds = new Map<string, string>();
    const endpoints = new Map<string, {
      nodeId?: string;
      inputs?: Map<string, string>;
      outputs?: Map<string, string>;
    }>();

    for (const node of levelNodes) {
      const definition = node.data?.component as ComponentDefinition | undefined;
      if (node.type === "component" && definition) {
        hasComponents = true;
        const child = expandLevel(
          definition.nodes,
          definition.edges,
          `${idPrefix}${node.id}::`,
          new Set(definition.inputs.map((port) => port.id)),
        );
        const inputs = new Map<string, string>();
        const outputs = new Map<string, string>();
        for (const port of definition.inputs) {
          const target = child.endpoints.get(port.id);
          const resolved = target?.nodeId ?? target?.inputs?.values().next().value;
          if (resolved) inputs.set(port.id, resolved);
        }
        for (const port of definition.outputs) {
          const source = child.endpoints.get(port.id);
          const resolved = source?.nodeId ?? source?.outputs?.values().next().value;
          if (resolved) outputs.set(port.id, resolved);
        }
        endpoints.set(node.id, { inputs, outputs });
        continue;
      }

      const expandedId = `${idPrefix}${node.id}`;
      localNodeIds.set(node.id, expandedId);
      if (idPrefix === "") nodeIds.set(node.id, expandedId);
      const isExposedInput =
        exposedInputIds.has(node.id) &&
        (node.type === "input" || node.type === "clock");
      expandedNodes.push({
        ...node,
        id: expandedId,
        type: isExposedInput ? "buffer" : node.type,
        selected: false,
      });
      endpoints.set(node.id, { nodeId: expandedId });
    }

    const nodeById = new Map(levelNodes.map((node) => [node.id, node]));
    for (const edge of levelEdges) {
      const sourceNode = nodeById.get(edge.source);
      const targetNode = nodeById.get(edge.target);
      const sourcePorts = endpoints.get(edge.source)?.outputs;
      const targetPorts = endpoints.get(edge.target)?.inputs;
      const sourceHandleId = edge.sourceHandle?.startsWith("output:")
        ? edge.sourceHandle.slice("output:".length)
        : undefined;
      const targetHandleId = edge.targetHandle?.startsWith("input:")
        ? edge.targetHandle.slice("input:".length)
        : undefined;
      const sourceId = sourceNode?.type === "component"
        ? (sourcePorts?.get(sourceHandleId ?? "") ?? sourcePorts?.values().next().value)
        : localNodeIds.get(edge.source);
      const targetId = targetNode?.type === "component"
        ? (targetPorts?.get(targetHandleId ?? "") ?? targetPorts?.values().next().value)
        : localNodeIds.get(edge.target);
      if (!sourceId || !targetId) continue;

      expandedEdges.push({
        ...edge,
        id: `${idPrefix}${edge.id}`,
        source: sourceId,
        target: targetId,
        sourceHandle: sourceNode?.type === "component" ? undefined : edge.sourceHandle,
        targetHandle: targetNode?.type === "component" ? undefined : edge.targetHandle,
      });
    }

    return { nodeIds: localNodeIds, endpoints };
  };

  const topLevel = expandLevel(nodes, edges, "", new Set());
  for (const node of nodes) {
    if (node.type !== "component") continue;
    const definition = node.data?.component as ComponentDefinition | undefined;
    if (!definition) continue;
    const endpoint = topLevel.endpoints.get(node.id);
    if (endpoint?.inputs) componentInputs.set(node.id, endpoint.inputs);
    if (endpoint?.outputs) componentOutputs.set(node.id, endpoint.outputs);
  }

  return {
    nodes: expandedNodes,
    edges: expandedEdges,
    nodeIds,
    componentInputs,
    componentOutputs,
    hasComponents,
  };
}

/**
 * イベント駆動型（キュー方式）の回路シミュレーション
 * フィードバックループ（ラッチ回路・フリップフロップなど）の記憶状態を正確に保持・更新し、
 * オシレーション（発振）を検出して該当エッジおよびノードをマークする
 */
export function simulateCircuitWithComponents(
  nodes: Node[],
  edges: Edge[],
  lastOutputs?: Map<string, boolean>,
): { nodes: Node[]; edges: Edge[]; outputs: Map<string, boolean> } {
  const expanded = expandComponents(nodes, edges);
  if (!expanded.hasComponents) {
    return simulateCircuit(nodes, edges, lastOutputs);
  }

  {
    const result = simulateCircuit(expanded.nodes, expanded.edges, lastOutputs);
    const expandedNodeById = new Map(result.nodes.map((node) => [node.id, node]));
    const expandedEdgeById = new Map(result.edges.map((edge) => [edge.id, edge]));
    // Keep flattened internal node states in the returned map so callers can
    // pass them into the next simulation and LATCH feedback remains intact.
    const outputs = new Map(result.outputs);
    const visibleNodes = nodes.map((node) => {
      const flatId = expanded.nodeIds.get(node.id);
      if (flatId) {
        const simulatedNode = expandedNodeById.get(flatId);
        const value = result.outputs.get(flatId) ?? false;
        outputs.set(node.id, value);
        return simulatedNode
          ? { ...node, data: { ...node.data, ...simulatedNode.data } }
          : node;
      }

      const portOutputs = expanded.componentOutputs.get(node.id);
      const outputEntries = Array.from(portOutputs ?? []);
      const value = outputEntries.length > 0
        ? result.outputs.get(outputEntries[0][1]) ?? false
        : false;
      outputs.set(node.id, value);
      const isOscillating = Array.from(expandedNodeById.entries()).some(
        ([id, expandedNode]) =>
          id.startsWith(`${node.id}::`) && Boolean(expandedNode.data?.isOscillating),
      );
      return {
        ...node,
        data: { ...node.data, value, isOscillating },
      };
    });

    const visibleEdges = edges.map((edge) => {
      const simulatedEdge = expandedEdgeById.get(edge.id);
      return simulatedEdge
        ? { ...edge, style: simulatedEdge.style, className: simulatedEdge.className }
        : edge;
    });
    return { nodes: visibleNodes, edges: visibleEdges, outputs };
  }
}

export function simulateCircuit(
  nodes: Node[],
  edges: Edge[],
  lastOutputs?: Map<string, boolean>,
): { nodes: Node[]; edges: Edge[]; outputs: Map<string, boolean> } {
  // 各ノードの現在の出力を保持するマップ
  const outputs = new Map<string, boolean>();

  // 1. 各ノードの初期出力状態を復元（前回の記憶状態があればそれを優先）
  for (const node of nodes) {
    if (node.type === "input" || node.type === "clock") {
      outputs.set(node.id, (node.data?.value as boolean) ?? false);
    } else if (lastOutputs?.has(node.id)) {
      outputs.set(node.id, lastOutputs.get(node.id)!);
    } else {
      outputs.set(node.id, (node.data?.value as boolean) ?? false);
    }
  }

  // 2. グラフ構造の構築（各ノードの上流エッジ・下流エッジ一覧）
  const nodeMap = new Map<string, Node>();
  const sourceEdgesMap = new Map<string, Edge[]>();
  const targetEdgesMap = new Map<string, Edge[]>();

  for (const node of nodes) {
    nodeMap.set(node.id, node);
    sourceEdgesMap.set(node.id, []);
    targetEdgesMap.set(node.id, []);
  }

  for (const edge of edges) {
    sourceEdgesMap.get(edge.target)?.push(edge);
    targetEdgesMap.get(edge.source)?.push(edge);
  }

  // 3. イベントキューとトグルカウントの初期化
  const nodeIdQueue = new Set<string>(nodes.map((n) => n.id));
  const toggleCounts = new Map<string, number>();
  for (const node of nodes) {
    toggleCounts.set(node.id, 0);
  }

  // 最大反復回数（安全のためのオシレーション上限）
  const MAX_ITER = Math.max(100, nodes.length * 15);
  let i = 0;

  // 4. イベント駆動による信号伝播
  while (nodeIdQueue.size > 0 && i < MAX_ITER) {
    const nodeId = nodeIdQueue.values().next().value as string;
    nodeIdQueue.delete(nodeId);
    i++;

    const node = nodeMap.get(nodeId);
    if (!node) continue;

    let nextOutput: boolean;

    if (node.type === "input" || node.type === "clock") {
      nextOutput = (node.data?.value as boolean) ?? false;
    } else {
      // 接続されたエッジから入力ピンごとの値を集約
      const sourceEdges = sourceEdgesMap.get(nodeId) ?? [];
      const inputs: boolean[] = [];

      for (const edge of sourceEdges) {
        inputs.push(outputs.get(edge.source) ?? false);
      }
      nextOutput = evaluateGate(node.type, inputs);
    }

    const prevOutput = outputs.get(nodeId);
    if (prevOutput !== nextOutput) {
      outputs.set(nodeId, nextOutput);
      toggleCounts.set(nodeId, (toggleCounts.get(nodeId) ?? 0) + 1);

      // このノードの出力が変わったため、下流の接続先ノードをキューに追加
      const outgoing = targetEdgesMap.get(nodeId) ?? [];
      for (const edge of outgoing) {
        nodeIdQueue.add(edge.target);
      }
    }
  }

  // 5. 発振（オシレーション）ノードの特定
  const isOscillating = i >= MAX_ITER;
  const OSCILLATION_THRESHOLD = 3; // 発振判定のトグル回数閾値
  const oscillatingNodeIds = new Set<string>();

  if (isOscillating) {
    // 3回以上反転したノードを発振源と判定
    for (const [nodeId, count] of toggleCounts.entries()) {
      if (count >= OSCILLATION_THRESHOLD) {
        oscillatingNodeIds.add(nodeId);
      }
    }

    // 発振源から到達可能なすべての下流ノード（OutputNodeなど）を探索
    const reachedNodeIdQueue = Array.from(oscillatingNodeIds);
    while (reachedNodeIdQueue.length > 0) {
      const currentNodeId = reachedNodeIdQueue.shift()!;
      const outgoing = targetEdgesMap.get(currentNodeId) ?? [];
      for (const edge of outgoing) {
        if (!oscillatingNodeIds.has(edge.target)) {
          oscillatingNodeIds.add(edge.target);
          reachedNodeIdQueue.push(edge.target);
        }
      }
    }
  }

  // 6. ノードのデータ更新判定
  let nodesChanged = false;
  const updatedNodes = nodes.map((node) => {
    const computedVal = outputs.get(node.id) ?? false;
    const nodeIsOscillating = isOscillating && oscillatingNodeIds.has(node.id);
    const prevVal = node.data?.value;
    const prevOsc = node.data?.isOscillating;

    if (prevVal !== computedVal || prevOsc !== nodeIsOscillating) {
      nodesChanged = true;
      return {
        ...node,
        data: {
          ...node.data,
          value: computedVal,
          isOscillating: nodeIsOscillating,
        },
      };
    }
    return node;
  });

  // ノード状態を保存して、次回のシミュレーションでもLATCHの記憶を引き継ぐ。
  if (lastOutputs) {
    for (const node of nodes) {
      if (node.type !== "input") {
        lastOutputs.set(
          node.id,
          outputs.get(node.id) ?? false,
        );
      }
    }
  }

  // 7. エッジのスタイル更新（発振時は赤色、HIGHは緑色、LOWは黒色）
  let edgesChanged = false;
  const updatedEdges = edges.map((edge) => {
    const edgeIsOscillating =
      isOscillating && oscillatingNodeIds.has(edge.source);
    const isHigh = outputs.get(edge.source) ?? false;

    let strokeColor = "#000000";
    if (edgeIsOscillating) {
      strokeColor = "#ef4444"; // 発振時は赤色
    } else if (isHigh) {
      strokeColor = "#22c55e"; // HIGHは緑色
    }

    const currentStroke = edge.style?.stroke;
    const targetClassName = edgeIsOscillating
      ? "edge-oscillating"
      : isHigh
        ? "edge-active"
        : "";
    const currentClassName = edge.className;

    if (currentStroke !== strokeColor || currentClassName !== targetClassName) {
      edgesChanged = true;
      return {
        ...edge,
        style: {
          ...edge.style,
          stroke: strokeColor,
          strokeWidth: 4,
        },
        className: targetClassName,
      };
    }
    return edge;
  });

  return {
    nodes: nodesChanged ? updatedNodes : nodes,
    edges: edgesChanged ? updatedEdges : edges,
    outputs,
  };
}
