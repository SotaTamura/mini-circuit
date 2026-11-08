import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  ViewportPortal,
  useReactFlow,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  type Node,
  type Edge,
  type OnConnect,
  type OnNodesChange,
  type OnEdgesChange,
} from "@xyflow/react";
import andIcon from "./assets/and.svg";
import orIcon from "./assets/or.svg";
import notIcon from "./assets/not.svg";
import nandIcon from "./assets/nand.svg";
import norIcon from "./assets/nor.svg";
import xorIcon from "./assets/xor.svg";
import xnorIcon from "./assets/xnor.svg";
import {
  AndNode,
  OrNode,
  NotNode,
  NandNode,
  NorNode,
  XorNode,
  XnorNode,
} from "./elements/gate-node";
import { InputNode, OutputNode } from "./elements/io-node";
import { ClockNode } from "./elements/clock-node";
import { ComponentNode, type SavedComponent } from "./elements/component-node";
import { simulateCircuitWithComponents } from "./utils/circuit";
import { CircuitContext } from "./context/circuit-context";

const nodeTypes = {
  input: InputNode,
  output: OutputNode,
  clock: ClockNode,
  and: AndNode,
  or: OrNode,
  not: NotNode,
  nand: NandNode,
  nor: NorNode,
  xor: XorNode,
  xnor: XnorNode,
  component: ComponentNode,
};

type ToolbarItem = {
  type: string;
  label: string;
  icon?: string;
  preview?: React.ReactNode;
};

const TOOLBAR_ITEMS: ToolbarItem[] = [
  {
    type: "input",
    label: "INPUT",
    preview: (
      <div className="w-full h-full flex items-center justify-center gap-1.5 pointer-events-none">
        <div className="w-12 h-12 bg-white border-2 border-gray-800 rounded flex items-center justify-center text-xl font-bold text-gray-900">
          IN
        </div>
      </div>
    ),
  },
  {
    type: "output",
    label: "OUTPUT",
    preview: (
      <div className="w-full h-full flex items-center justify-center gap-1.5 pointer-events-none">
        <div className="w-12 h-12 bg-white border-2 border-gray-800 rounded flex items-center justify-center text-xl font-bold text-gray-900">
          OUT
        </div>
      </div>
    ),
  },
  { type: "and", label: "AND", icon: andIcon },
  { type: "or", label: "OR", icon: orIcon },
  { type: "not", label: "NOT", icon: notIcon },
  { type: "nand", label: "NAND", icon: nandIcon },
  { type: "nor", label: "NOR", icon: norIcon },
  { type: "xor", label: "XOR", icon: xorIcon },
  { type: "xnor", label: "XNOR", icon: xnorIcon },
  {
    type: "clock",
    label: "CLK",
    preview: (
      <div className="flex h-12 w-16 items-center justify-center rounded border-2 border-gray-800 bg-white font-mono text-lg font-bold text-gray-900">
        CLK
      </div>
    ),
  },
];

const NODE_DIMENSIONS: Record<string, { width: number; height: number }> = {
  input: { width: 112, height: 48 },
  output: { width: 112, height: 48 },
  clock: { width: 64, height: 48 },
};
const DEFAULT_DIMENSION = { width: 148.5, height: 108 };
const COMPONENT_DIMENSION = { width: 132, height: 132 };
const WORKSPACE_STORAGE_KEY = "circuit-workspace-v1";

const initialSimulation = simulateCircuitWithComponents([], []);

type PersistedWorkspace = {
  nodes: Node[];
  edges: Edge[];
  savedComponents: SavedComponent[];
  lastOutputs: [string, boolean][];
};

function loadWorkspace(): PersistedWorkspace {
  const emptyWorkspace = {
    nodes: initialSimulation.nodes,
    edges: initialSimulation.edges,
    savedComponents: [] as SavedComponent[],
    lastOutputs: [] as [string, boolean][],
  };
  try {
    const storedWorkspace = localStorage.getItem(WORKSPACE_STORAGE_KEY);
    if (storedWorkspace) {
      const parsed = JSON.parse(storedWorkspace) as Partial<PersistedWorkspace>;
      return {
        nodes: Array.isArray(parsed.nodes)
          ? parsed.nodes
          : emptyWorkspace.nodes,
        edges: Array.isArray(parsed.edges)
          ? parsed.edges
          : emptyWorkspace.edges,
        savedComponents: Array.isArray(parsed.savedComponents)
          ? parsed.savedComponents
          : emptyWorkspace.savedComponents,
        lastOutputs: Array.isArray(parsed.lastOutputs)
          ? parsed.lastOutputs
          : [],
      };
    }

    return emptyWorkspace;
  } catch {
    return emptyWorkspace;
  }
}

const initialWorkspace = loadWorkspace();

function getConnectedCircuit(seedNodeId: string, nodes: Node[], edges: Edge[]) {
  const nodeIds = new Set([seedNodeId]);
  const nodeIdQueue = [seedNodeId];
  while (nodeIdQueue.length > 0) {
    const currentId = nodeIdQueue.shift()!;
    for (const edge of edges) {
      const neighborId =
        edge.source === currentId
          ? edge.target
          : edge.target === currentId
            ? edge.source
            : undefined;
      if (neighborId && !nodeIds.has(neighborId)) {
        nodeIds.add(neighborId);
        nodeIdQueue.push(neighborId);
      }
    }
  }

  return {
    nodes: nodes.filter((node) => nodeIds.has(node.id)),
    edges: edges.filter(
      (edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target),
    ),
  };
}

function createComponentSnapshot(
  id: string,
  name: string,
  seedNodeId: string,
  nodes: Node[],
  edges: Edge[],
): SavedComponent {
  const circuit = getConnectedCircuit(seedNodeId, nodes, edges);
  const minX = Math.min(...circuit.nodes.map((node) => node.position.x));
  const minY = Math.min(...circuit.nodes.map((node) => node.position.y));
  return {
    id,
    name,
    sourceSeedNodeId: seedNodeId,
    nodes: circuit.nodes.map((node) => ({
      ...node,
      selected: false,
      data: { ...node.data, value: false, isOscillating: false },
      position: { x: node.position.x - minX, y: node.position.y - minY },
    })),
    edges: circuit.edges.map((edge) => ({
      ...edge,
      style: undefined,
      className: undefined,
    })),
    inputs: circuit.nodes
      .filter((node) => node.type === "input" || node.type === "clock")
      .map((node) => ({
        id: node.id,
        label: String(node.type === "clock" ? "CLK" : node.data?.label || "IN"),
      })),
    outputs: circuit.nodes
      .filter((node) => node.type === "output")
      .map((node) => ({
        id: node.id,
        label: String(node.data?.label || "OUT"),
      })),
  };
}

function attachLatestComponents(
  nodes: Node[],
  components: SavedComponent[],
): Node[] {
  const componentsById = new Map(
    components.map((component) => [component.id, component]),
  );
  return nodes.map((node) => {
    if (node.type !== "component") return node;
    const existing = node.data?.component as SavedComponent | undefined;
    const latest = existing ? componentsById.get(existing.id) : undefined;
    return latest && latest !== existing
      ? { ...node, data: { ...node.data, component: latest } }
      : node;
  });
}

function removeInvalidComponentEdges(edges: Edge[], nodes: Node[]): Edge[] {
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  return edges.filter((edge) => {
    const source = nodesById.get(edge.source);
    if (source?.type === "component") {
      const component = source.data?.component as SavedComponent | undefined;
      const outputId = edge.sourceHandle?.startsWith("output:")
        ? edge.sourceHandle.slice("output:".length)
        : "";
      if (!component?.outputs.some((port) => port.id === outputId))
        return false;
    }

    const target = nodesById.get(edge.target);
    if (target?.type === "component") {
      const component = target.data?.component as SavedComponent | undefined;
      const inputId = edge.targetHandle?.startsWith("input:")
        ? edge.targetHandle.slice("input:".length)
        : "";
      if (!component?.inputs.some((port) => port.id === inputId)) return false;
    }
    return true;
  });
}

let idCounter = initialWorkspace.nodes.reduce((max, node) => {
  const match = node.id.match(/_(\d+)$/);
  return match ? Math.max(max, Number(match[1])) : max;
}, 0);

function CircuitFlow() {
  const [nodes, setNodes] = useState<Node[]>(initialWorkspace.nodes);
  const [edges, setEdges] = useState<Edge[]>(initialWorkspace.edges);
  const [savedComponents, setSavedComponents] = useState<SavedComponent[]>(
    initialWorkspace.savedComponents,
  );
  const liveSavedComponents = useMemo(
    () =>
      savedComponents.map((component) => {
        const seedNodeId = component.sourceSeedNodeId;
        if (!seedNodeId || !nodes.some((node) => node.id === seedNodeId)) {
          return component;
        }
        const snapshot = createComponentSnapshot(
          component.id,
          component.name,
          seedNodeId,
          nodes,
          edges,
        );
        return JSON.stringify(snapshot) === JSON.stringify(component)
          ? component
          : snapshot;
      }),
    [edges, nodes, savedComponents],
  );
  const renderedNodes = useMemo(
    () => attachLatestComponents(nodes, liveSavedComponents),
    [liveSavedComponents, nodes],
  );
  const liveEdges = useMemo(
    () => removeInvalidComponentEdges(edges, renderedNodes),
    [edges, renderedNodes],
  );
  const [componentMenu, setComponentMenu] = useState<{
    x: number;
    y: number;
    componentId: string;
  } | null>(null);
  const [elementMenu, setElementMenu] = useState<{
    x: number;
    y: number;
    targetType: "node" | "edge";
    id: string;
  } | null>(null);
  const [clockHzDraft, setClockHzDraft] = useState("1");
  const lastOutputsRef = useRef<Map<string, boolean>>(
    new Map(initialWorkspace.lastOutputs),
  );
  const { deleteElements, screenToFlowPosition } = useReactFlow();
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);

  useEffect(() => {
    nodesRef.current = renderedNodes;
  }, [renderedNodes]);

  useEffect(() => {
    edgesRef.current = liveEdges;
  }, [liveEdges]);

  useEffect(() => {
    const workspace: PersistedWorkspace = {
      nodes: renderedNodes.map((node) => ({
        ...node,
        selected: false,
        dragging: false,
      })),
      edges: liveEdges,
      savedComponents: liveSavedComponents,
      lastOutputs: Array.from(lastOutputsRef.current.entries()),
    };
    localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(workspace));
  }, [liveEdges, liveSavedComponents, renderedNodes]);

  const clockConfigKey = JSON.stringify(
    nodes
      .filter((node) => node.type === "clock")
      .map((node) => ({
        id: node.id,
        hz: Math.max(0.1, Number(node.data?.hz) || 1),
      })),
  );

  const saveConnectedComponent = useCallback(
    (seedNodeId: string) => {
      const connectedCircuit = getConnectedCircuit(
        seedNodeId,
        renderedNodes,
        liveEdges,
      );
      if (connectedCircuit.nodes.length === 0) return;

      setElementMenu(null);
      const name = window.prompt("コンポーネント名を入力", "My Circuit");
      if (!name?.trim()) return;

      const component = createComponentSnapshot(
        `component_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        name.trim(),
        seedNodeId,
        renderedNodes,
        liveEdges,
      );
      setSavedComponents((current) => [...current, component]);
      setElementMenu(null);
    },
    [liveEdges, renderedNodes],
  );

  const onNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: Node) => {
      event.preventDefault();
      if (node.type === "clock") {
        setClockHzDraft(String(Math.max(0.1, Number(node.data?.hz) || 1)));
      }
      setElementMenu({
        x: event.clientX,
        y: event.clientY,
        targetType: "node",
        id: node.id,
      });
    },
    [],
  );

  const onEdgeContextMenu = useCallback(
    (event: React.MouseEvent, edge: Edge) => {
      event.preventDefault();
      setElementMenu({
        x: event.clientX,
        y: event.clientY,
        targetType: "edge",
        id: edge.id,
      });
    },
    [],
  );

  const toggleInputValues = useCallback((ids: string[]) => {
    const idsToToggle = new Set(ids);
    const currentNodes = nodesRef.current;
    const updatedNodes = currentNodes.map((node) =>
      idsToToggle.has(node.id) &&
      (node.type === "input" || node.type === "clock")
        ? { ...node, data: { ...node.data, value: !node.data?.value } }
        : node,
    );
    if (updatedNodes.every((node, index) => node === currentNodes[index]))
      return;
    const result = simulateCircuitWithComponents(
      updatedNodes,
      edgesRef.current,
      lastOutputsRef.current,
    );
    lastOutputsRef.current = result.outputs;
    nodesRef.current = result.nodes;
    edgesRef.current = result.edges;
    setNodes(result.nodes);
    setEdges(result.edges);
  }, []);

  const toggleInputValue = useCallback(
    (id: string) => toggleInputValues([id]),
    [toggleInputValues],
  );

  useEffect(() => {
    const clocks = JSON.parse(clockConfigKey) as { id: string; hz: number }[];
    if (clocks.length === 0) return;

    const clockSchedule = clocks.map(({ id, hz }) => {
      const period = 500 / hz;
      return { id, period, nextToggleAt: performance.now() + period };
    });

    let timer: number;
    const runClockScheduler = () => {
      const now = performance.now();
      const dueNodeIds: string[] = [];
      let nextDelay = Number.POSITIVE_INFINITY;

      for (const clock of clockSchedule) {
        if (now >= clock.nextToggleAt) {
          const elapsedPeriods =
            Math.floor((now - clock.nextToggleAt) / clock.period) + 1;
          if (elapsedPeriods % 2 === 1) dueNodeIds.push(clock.id);
          clock.nextToggleAt += elapsedPeriods * clock.period;
        }
        nextDelay = Math.min(nextDelay, clock.nextToggleAt - now);
      }

      if (dueNodeIds.length > 0) toggleInputValues(dueNodeIds);
      timer = window.setTimeout(runClockScheduler, Math.max(1, nextDelay));
    };

    timer = window.setTimeout(runClockScheduler, 1);
    return () => window.clearTimeout(timer);
  }, [clockConfigKey, toggleInputValues]);

  const DeleteComponent = useCallback((componentId: string) => {
    setSavedComponents((current) =>
      current.filter((component) => component.id !== componentId),
    );
  }, []);

  const renameComponent = useCallback((componentId: string, name: string) => {
    setSavedComponents((current) =>
      current.map((component) =>
        component.id === componentId ? { ...component, name } : component,
      ),
    );
  }, []);

  const onNodesChange: OnNodesChange = useCallback(
    (changes) => {
      setNodes((nodesSnapshot) => {
        const nextNodes = applyNodeChanges(changes, nodesSnapshot);
        const removedNodeIds = new Set(
          changes
            .filter((change) => change.type === "remove")
            .map((change) => change.id),
        );
        if (removedNodeIds.size > 0) {
          const remainingEdges = liveEdges.filter(
            (edge) =>
              !removedNodeIds.has(edge.source) &&
              !removedNodeIds.has(edge.target),
          );
          const result = simulateCircuitWithComponents(
            attachLatestComponents(nextNodes, liveSavedComponents),
            remainingEdges,
            lastOutputsRef.current,
          );
          lastOutputsRef.current = result.outputs;
          setEdges(result.edges);
          return result.nodes;
        }
        return nextNodes;
      });
    },
    [liveEdges, liveSavedComponents],
  );

  const onEdgesChange: OnEdgesChange = useCallback(
    (changes) => {
      const nextEdges = applyEdgeChanges(changes, liveEdges);
      if (changes.some((change) => change.type === "remove")) {
        const result = simulateCircuitWithComponents(
          renderedNodes,
          nextEdges,
          lastOutputsRef.current,
        );
        lastOutputsRef.current = result.outputs;
        nodesRef.current = result.nodes;
        edgesRef.current = result.edges;
        setNodes(result.nodes);
        setEdges(result.edges);
        return;
      }
      edgesRef.current = nextEdges;
      setEdges(nextEdges);
    },
    [liveEdges, renderedNodes],
  );

  const onConnect: OnConnect = useCallback(
    (params) => {
      const nextEdges = addEdge(params, liveEdges);
      const result = simulateCircuitWithComponents(
        renderedNodes,
        nextEdges,
        lastOutputsRef.current,
      );
      lastOutputsRef.current = result.outputs;
      nodesRef.current = result.nodes;
      edgesRef.current = result.edges;
      setNodes(result.nodes);
      setEdges(result.edges);
    },
    [liveEdges, renderedNodes],
  );

  const onDragStart = (event: React.DragEvent, type: string) => {
    event.dataTransfer.setData("application/reactflow", type);
    event.dataTransfer.setData("text/plain", type);
    event.dataTransfer.effectAllowed = "move";
  };

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const type =
        event.dataTransfer.getData("application/reactflow") ||
        event.dataTransfer.getData("text/plain");

      if (!type) {
        return;
      }

      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const savedComponent = type.startsWith("component:")
        ? liveSavedComponents.find(
            (component) => component.id === type.slice("component:".length),
          )
        : undefined;
      const nodeType = savedComponent ? "component" : type;
      if (!savedComponent && !(type in nodeTypes)) return;
      const dim = savedComponent
        ? COMPONENT_DIMENSION
        : (NODE_DIMENSIONS[nodeType] ?? DEFAULT_DIMENSION);

      const newNode: Node = {
        id: `${nodeType}_${++idCounter}`,
        type: nodeType,
        position: {
          x: position.x - dim.width / 2,
          y: position.y - dim.height / 2,
        },
        data: savedComponent
          ? { value: false, component: savedComponent }
          : nodeType === "clock"
            ? { value: false, hz: 1 }
            : { value: false },
      };

      const nextNodes = renderedNodes.concat(newNode);
      const result = simulateCircuitWithComponents(
        nextNodes,
        liveEdges,
        lastOutputsRef.current,
      );
      lastOutputsRef.current = result.outputs;
      nodesRef.current = result.nodes;
      edgesRef.current = result.edges;
      setNodes(result.nodes);
      setEdges(result.edges);
    },
    [renderedNodes, liveEdges, liveSavedComponents, screenToFlowPosition],
  );

  const componentGroups = liveSavedComponents.flatMap((component) => {
    const seedNodeId = component.sourceSeedNodeId;
    if (!seedNodeId || !nodes.some((node) => node.id === seedNodeId)) return [];
    const circuit = getConnectedCircuit(seedNodeId, nodes, edges);
    if (circuit.nodes.length === 0) return [];

    const bounds = circuit.nodes.reduce(
      (rect, node) => {
        const width =
          node.measured?.width ??
          node.width ??
          NODE_DIMENSIONS[node.type ?? ""]?.width ??
          (node.type === "component"
            ? COMPONENT_DIMENSION.width
            : DEFAULT_DIMENSION.width);
        const height =
          node.measured?.height ??
          node.height ??
          NODE_DIMENSIONS[node.type ?? ""]?.height ??
          (node.type === "component"
            ? COMPONENT_DIMENSION.height
            : DEFAULT_DIMENSION.height);
        return {
          left: Math.min(rect.left, node.position.x),
          top: Math.min(rect.top, node.position.y),
          right: Math.max(rect.right, node.position.x + width),
          bottom: Math.max(rect.bottom, node.position.y + height),
        };
      },
      { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity },
    );
    const padding = 24;
    const titleHeight = 30;
    return [
      {
        id: component.id,
        name: component.name,
        left: bounds.left - padding,
        top: bounds.top - padding - titleHeight,
        width: bounds.right - bounds.left + padding * 2,
        height: bounds.bottom - bounds.top + padding * 2 + titleHeight,
      },
    ];
  });

  return (
    <CircuitContext.Provider value={{ toggleInputValue }}>
      <div
        onClick={() => {
          setElementMenu(null);
          setComponentMenu(null);
        }}
      >
        <div className="bg-gray-200 w-full h-[10vh] overflow-x-auto select-none border-b border-gray-300">
          <div className="inline-flex h-full gap-4 p-4 items-center">
            {TOOLBAR_ITEMS.map((item) => (
              <div
                key={item.type}
                title={item.label}
                className="inline-flex flex-col items-center justify-center w-[10vh] h-[8vh] p-2 cursor-grab active:cursor-grabbing hover:bg-gray-300 rounded transition-colors"
                draggable
                onDragStart={(e) => onDragStart(e, item.type)}
              >
                {item.icon ? (
                  <img
                    src={item.icon}
                    alt={item.label}
                    className="w-full h-full object-contain pointer-events-none"
                    draggable={false}
                  />
                ) : (
                  item.preview
                )}
              </div>
            ))}
            {liveSavedComponents.map((component) => (
              <div
                key={component.id}
                title={component.name}
                className="inline-flex h-[8vh] w-[10vh] shrink-0 cursor-grab items-center justify-center rounded border-2 border-gray-700 bg-white p-2 text-center text-xs font-semibold text-gray-800 hover:bg-gray-100 active:cursor-grabbing"
                onContextMenu={(event) => {
                  event.preventDefault();
                  setComponentMenu({
                    x: event.clientX,
                    y: event.clientY,
                    componentId: component.id,
                  });
                }}
                draggable
                onDragStart={(event) =>
                  onDragStart(event, `component:${component.id}`)
                }
              >
                <span className="line-clamp-3">{component.name}</span>
              </div>
            ))}
            {componentMenu && (
              <div
                className="fixed z-[1000] min-w-48 rounded border border-gray-300 bg-white py-1 shadow-lg"
                style={{ left: componentMenu.x, top: componentMenu.y }}
                onContextMenu={(event) => event.preventDefault()}
                onClick={(event) => event.stopPropagation()}
              >
                <button
                  type="button"
                  className="w-full px-3 py-2 text-left text-sm text-gray-800 hover:bg-gray-100"
                  onClick={() => {
                    DeleteComponent(componentMenu.componentId);
                    setComponentMenu(null);
                  }}
                >
                  削除
                </button>
              </div>
            )}
          </div>
        </div>
        <div
          className="w-full h-[90vh]"
          onDragOver={onDragOver}
          onDrop={onDrop}
        >
          <ReactFlow
            nodeTypes={nodeTypes}
            nodes={renderedNodes}
            edges={liveEdges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeContextMenu={onNodeContextMenu}
            onEdgeContextMenu={onEdgeContextMenu}
            onPaneClick={() => {
              setElementMenu(null);
              setComponentMenu(null);
            }}
            fitView
            fitViewOptions={{ padding: 0.2 }}
          >
            <ViewportPortal>
              {componentGroups.map((group) => (
                <div
                  key={group.id}
                  className="pointer-events-none absolute rounded-xl border-2 border-dashed border-indigo-500/80"
                  style={{
                    left: group.left,
                    top: group.top,
                    width: group.width,
                    height: group.height,
                    zIndex: 0,
                  }}
                >
                  <input
                    aria-label="コンポーネント名"
                    className="nodrag nopan pointer-events-auto absolute -top-10 left-3 w-40 px-2 py-1 text-xl font-semibold hover:border hover:border-gray-300 text-indigo-500 focus:border-indigo-500 focus:outline-none"
                    value={group.name}
                    onChange={(event) =>
                      renameComponent(group.id, event.target.value)
                    }
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => event.stopPropagation()}
                    onKeyDown={(event) => event.stopPropagation()}
                  />
                </div>
              ))}
            </ViewportPortal>
          </ReactFlow>
          {elementMenu && (
            <div
              className="fixed z-[1000] min-w-48 rounded border border-gray-300 bg-white py-1 shadow-lg"
              style={{ left: elementMenu.x, top: elementMenu.y }}
              onContextMenu={(event) => event.preventDefault()}
              onClick={(event) => event.stopPropagation()}
            >
              {elementMenu.targetType === "node" &&
                renderedNodes.find(
                  (node) => node.id === elementMenu.id && node.type === "clock",
                ) && (
                  <form
                    className="border-b border-gray-200 px-3 py-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const hz = Number(clockHzDraft);
                      if (!Number.isFinite(hz) || hz <= 0) return;
                      setNodes((currentNodes) =>
                        currentNodes.map((node) =>
                          node.id === elementMenu.id
                            ? {
                                ...node,
                                data: {
                                  ...node.data,
                                  hz: Math.min(100, Math.max(0.1, hz)),
                                },
                              }
                            : node,
                        ),
                      );
                      setElementMenu(null);
                    }}
                  >
                    <label className="mb-1 block text-xs font-medium text-gray-700">
                      周波数 (Hz)
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        min="0.1"
                        max="100"
                        step="0.1"
                        value={clockHzDraft}
                        onChange={(event) =>
                          setClockHzDraft(event.target.value)
                        }
                        className="nodrag w-24 rounded border border-gray-300 px-2 py-1 text-sm"
                      />
                      <button
                        type="submit"
                        className="rounded bg-gray-800 px-2 py-1 text-xs text-white hover:bg-gray-700"
                      >
                        OK
                      </button>
                    </div>
                  </form>
                )}
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-sm text-gray-800 hover:bg-gray-100"
                onClick={() => {
                  // react flowの画面内から、選択したノードまたはエッジのみ削除
                  deleteElements({
                    nodes:
                      elementMenu.targetType === "node"
                        ? renderedNodes.filter(
                            (node) => node.id === elementMenu.id,
                          )
                        : [],
                    edges:
                      elementMenu.targetType === "edge"
                        ? liveEdges.filter((edge) => edge.id === elementMenu.id)
                        : [],
                  });
                  setElementMenu(null);
                }}
              >
                削除
              </button>
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-sm text-gray-800 hover:bg-gray-100"
                onClick={() =>
                  saveConnectedComponent(
                    elementMenu.targetType === "node"
                      ? elementMenu.id
                      : (liveEdges.find((edge) => edge.id === elementMenu.id)
                          ?.source as string),
                  )
                }
              >
                コンポーネントとして追加
              </button>
            </div>
          )}
        </div>
      </div>
    </CircuitContext.Provider>
  );
}

export default function App() {
  return (
    <ReactFlowProvider>
      <CircuitFlow />
    </ReactFlowProvider>
  );
}
