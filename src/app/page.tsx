"use client";

import React, { useCallback, useMemo, useState, memo, useRef, useEffect } from "react";
import {
  ReactFlow,
  addEdge,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  Handle,
  Position,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Room, RoomEvent, createLocalAudioTrack, RemoteParticipant } from "livekit-client";
import { RunModal } from "@/components/RunModal";

/* =========================
   NODE COMPONENTS
========================= */

const LLMNode = memo(({ data }: { data: any }) => {
  const hasTools = data.tools?.length > 0;

  return (
    <div className="relative p-4 bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl min-w-[220px] shadow-2xl shadow-blue-500/10 overflow-hidden group hover:border-blue-500/30 transition-all duration-300">
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-purple-500 opacity-50" />

      <Handle type="target" position={Position.Top} className="!w-2 !h-2 !bg-blue-500 !border-0 !top-0" />

      <div className="flex items-center gap-2 mb-2">
        <div className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]" />
        <strong className="text-white text-xs uppercase tracking-wider font-bold">LLM Brain</strong>
      </div>

      <div className="text-xs text-gray-400 mb-2 line-clamp-2 italic font-serif">
        "{data.prompt || "Default processing..."}"
      </div>

      {hasTools && (
        <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-[9px] text-blue-400 font-bold uppercase tracking-tighter">
          <svg className="w-2 h-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
          Tools Active
        </div>
      )}

      {data.streamingText && (
        <div className="text-[10px] text-green-400/90 bg-black/40 p-2 rounded-lg mt-3 max-h-[120px] overflow-y-auto custom-scrollbar border border-white/5 font-mono leading-relaxed">
          {data.streamingText}
        </div>
      )}

      <Handle type="source" position={Position.Bottom} className="!w-2 !h-2 !bg-blue-500 !border-0 !bottom-0" />
    </div>
  );
});

const DecisionNode = memo(({ data }: { data: any }) => (
  <div className="relative p-4 bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl min-w-[160px] shadow-2xl shadow-orange-500/10 hover:border-orange-500/30 transition-all duration-300">
    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-orange-500 to-yellow-500 opacity-50" />

    <Handle type="target" position={Position.Top} className="!w-2 !h-2 !bg-orange-500 !border-0 !top-0" />

    <div className="flex items-center gap-2 mb-1">
      <div className="w-2 h-2 rounded-full bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.5)]" />
      <strong className="text-white text-xs uppercase tracking-wider font-bold">Gatekeeper</strong>
    </div>

    <div className="text-[11px] text-gray-400 font-mono bg-black/20 p-1.5 rounded border border-white/5">
      {data.condition || "no condition"}
    </div>

    <div className="flex justify-between mt-3 px-1">
      <span className="text-[9px] text-green-400 font-bold uppercase tracking-tighter">True</span>
      <span className="text-[9px] text-red-400 font-bold uppercase tracking-tighter">False</span>
    </div>

    <Handle id="true" type="source" position={Position.Left} className="!w-2 !h-2 !bg-green-500 !border-0 !left-0" />
    <Handle id="false" type="source" position={Position.Right} className="!w-2 !h-2 !bg-red-500 !border-0 !right-0" />
  </div>
));

const ToolNode = memo(({ data }: { data: any }) => (
  <div className="relative p-4 bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl min-w-[200px] shadow-2xl shadow-purple-500/10 hover:border-purple-500/30 transition-all duration-300">
    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-purple-500 to-pink-500 opacity-50" />

    <Handle type="target" position={Position.Top} className="!w-2 !h-2 !bg-purple-500 !border-0 !top-0" />

    <div className="flex items-center gap-2 mb-2">
      <div className="w-2 h-2 rounded-full bg-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.5)]" />
      <strong className="text-white text-xs uppercase tracking-wider font-bold">Utility</strong>
    </div>

    <div className="text-[13px] font-bold text-purple-400 mb-1">{data.name}</div>
    <div className="text-[10px] text-gray-400 leading-tight">
      {data.description?.slice(0, 60)}...
    </div>

    <Handle type="source" position={Position.Bottom} className="!w-2 !h-2 !bg-purple-500 !border-0 !bottom-0" />
  </div>
));

const nodeTypes = {
  llm: LLMNode,
  decision: DecisionNode,
  tool: ToolNode,
};

/* =========================
   CONFIG PANEL (FULL FIX)
========================= */

const NodeConfigPanel = ({ node, onUpdate, onDelete }: { node?: any; onUpdate?: any; onDelete?: any }) => {
  if (!node) return <div className="p-2 text-white">Select a node</div>;

  const data = node.data;

  const update = (patch: any) => onUpdate({ ...data, ...patch });

  return (
    <div className="p-4 text-white h-full overflow-y-auto">
      <h3 className="text-lg mb-4">Edit {data.type}</h3>

      {/* ================= LLM ================= */}
      {data.type === "llm" && (
        <>
          <label className="text-sm">Prompt</label>
          <textarea
            value={data.prompt || ""}
            onChange={(e) => update({ prompt: e.target.value })}
            className="w-full p-2 bg-gray-800 border border-gray-600 rounded"
          />

          <label className="text-sm mt-3 block">Tools</label>
          <input
            value={(data.tools || []).join(", ")}
            onChange={(e) =>
              update({
                tools: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
              })
            }
            className="w-full p-2 bg-gray-800 border border-gray-600 rounded"
          />

          {/* STRUCTURED OUTPUT */}
          <div className="mt-4 border-t pt-3 border-gray-700">
            <button
              onClick={() =>
                update({
                  structuredOutput: {
                    ...(data.structuredOutput || {}),
                    enabled: !data.structuredOutput?.enabled,
                  },
                })
              }
              className="bg-blue-600 px-2 py-1 rounded text-xs"
            >
              Structured Output: {data.structuredOutput?.enabled ? "ON" : "OFF"}
            </button>

            {data.structuredOutput?.enabled && (
              <>
                {/* MODE */}
                <button
                  onClick={() =>
                    update({
                      structuredOutput: {
                        ...(data.structuredOutput || {}),
                        codeMode: !data.structuredOutput?.codeMode,
                      },
                    })
                  }
                  className="mt-2 bg-purple-600 px-2 py-1 text-xs rounded"
                >
                  Mode: {data.structuredOutput?.codeMode ? "Code" : "Visual"}
                </button>

                {/* CODE MODE */}
                {data.structuredOutput?.codeMode ? (
                  <textarea
                    value={data.structuredOutput?.zodCode || ""}
                    onChange={(e) =>
                      update({
                        structuredOutput: {
                          ...(data.structuredOutput || {}),
                          zodCode: e.target.value,
                        },
                      })
                    }
                    className="w-full mt-2 p-2 bg-black text-green-400 text-xs font-mono"
                  />
                ) : (
                  <>
                    {/* VISUAL SCHEMA */}
                    {(data.structuredOutput?.schema || []).map((f: any, i: number) => (
                      <div key={i} className="bg-gray-800 p-2 mt-2 rounded">
                        <input
                          value={f.name}
                          onChange={(e) => {
                            const s = [...(data.structuredOutput.schema || [])];
                            s[i].name = e.target.value;
                            update({ structuredOutput: { ...data.structuredOutput, schema: s } });
                          }}
                          className="w-full mb-1 p-1 bg-gray-700"
                        />
                        <select
                          value={f.type}
                          onChange={(e) => {
                            const s = [...(data.structuredOutput.schema || [])];
                            s[i].type = e.target.value;
                            update({ structuredOutput: { ...data.structuredOutput, schema: s } });
                          }}
                          className="w-full mb-1 p-1 bg-gray-700"
                        >
                          <option value="string">string</option>
                          <option value="number">number</option>
                          <option value="boolean">boolean</option>
                        </select>
                      </div>
                    ))}

                    <button
                      onClick={() =>
                        update({
                          structuredOutput: {
                            ...(data.structuredOutput || {}),
                            schema: [
                              ...(data.structuredOutput?.schema || []),
                              { name: "", type: "string" },
                            ],
                          },
                        })
                      }
                      className="mt-2 bg-blue-600 px-2 py-1 text-xs"
                    >
                      + Field
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        </>
      )}

      {/* ================= DECISION ================= */}
      {data.type === "decision" && (
        <input
          value={data.condition || ""}
          onChange={(e) => update({ condition: e.target.value })}
          className="w-full p-2 bg-gray-800 border border-gray-600 rounded"
        />
      )}

      {/* ================= TOOL ================= */}
      {data.type === "tool" && (
        <>
          <input
            value={data.name || ""}
            onChange={(e) => update({ name: e.target.value })}
            className="w-full p-2 bg-gray-800 border border-gray-600 rounded"
          />

          <textarea
            value={data.description || ""}
            onChange={(e) => update({ description: e.target.value })}
            className="w-full p-2 mt-2 bg-gray-800 border border-gray-600 rounded"
          />
        </>
      )}

      <button
        onClick={onDelete}
        className="mt-4 bg-red-600 px-3 py-2 rounded w-full"
      >
        Delete
      </button>
    </div>
  );
};

/* =========================
   MAIN
========================= */

export default function AgentBuilder() {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [agentId, setAgentId] = useState("my-agent");
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isRunModalOpen, setIsRunModalOpen] = useState(false);

  // LiveKit States
  const [isVoiceActive, setIsVoiceActive] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState("Idle");
  const [isAgentJoined, setIsAgentJoined] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState("");
  const [liveAiResponse, setLiveAiResponse] = useState("");
  const roomRef = useRef<Room | null>(null);

  const startVoiceCall = async () => {
    if (isVoiceActive) {
      roomRef.current?.disconnect();
      return;
    }

    setVoiceStatus("Connecting...");
    setIsVoiceActive(true);

    try {
      const res = await fetch(`/api/livekit-token?room=${agentId}&identity=designer`);
      const { token, url } = await res.json();

      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
      });
      roomRef.current = room;

      room.on(RoomEvent.ParticipantConnected, () => {
        setVoiceStatus("Agent Online");
        setIsAgentJoined(true);
      });

      room.on(RoomEvent.TrackSubscribed, (track) => {
        if (track.kind === "audio") {
          const el = track.attach();
          el.autoplay = true;
          document.body.appendChild(el);
          setVoiceStatus("Agent Speaking");
        }
      });

      room.on(RoomEvent.TrackUnsubscribed, (track) => {
        track.detach().forEach(el => el.remove());
      });

      room.on(RoomEvent.Disconnected, () => {
        setIsVoiceActive(false);
        setVoiceStatus("Disconnected");
        setIsAgentJoined(false);
      });

      await room.connect(url, token);
      console.log("Connected to room:", room.name);

      // Don't set metadata from client - worker will get config from API

      const audioTrack = await createLocalAudioTrack();
      await room.localParticipant.publishTrack(audioTrack);

      setVoiceStatus("Listening...");
    } catch (err) {
      console.error(err);
      setVoiceStatus("Connection Failed");
      setIsVoiceActive(false);
    }
  };

  useEffect(() => {
    return () => {
      roomRef.current?.disconnect();
    };
  }, []);

  const saveAgent = async () => {
    setIsSaving(true);
    try {
      await fetch(`/api/agent/${agentId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: agentId, ...agent }),
      });
      alert(`Saved: ${agentId}`);
    } catch (e) {
      alert("Save failed");
    }
    setIsSaving(false);
  };

  const loadAgent = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/agent/${agentId}`);
      const data = await res.json();
      if (data.nodes) {
        const loadedNodes = Object.entries(data.nodes).map(([id, nodeData]: [string, any]) => ({
          id,
          type: nodeData.type,
          position: { x: 200 + Math.random() * 100, y: 100 + Math.random() * 100 },
          data: { ...nodeData },
        }));
        setNodes(loadedNodes);
        setEdges(data.edges || []);
      }
    } catch (e) {
      alert("Agent not found");
    }
    setIsLoading(false);
  };

  const addNode = (type) => {
    const id = crypto.randomUUID();
    setNodes((nds) => [
      ...nds,
      {
        id,
        type,
        position: { x: 200, y: 100 },
        data: { id, type, tools: [] },
      },
    ]);
  };

  const onConnect = useCallback((params) => {
    setEdges((eds) => addEdge(params, eds));
  }, []);

  const updateNode = (id, data) => {
    setNodes((nds) => nds.map((n) => (n.id === id ? { ...n, data } : n)));
  };

  const deleteNode = (id) => {
    setNodes((nds) => nds.filter((n) => n.id !== id));
    setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id));
    setSelectedNodeId(null);
  };
  const runAgent = async () => {
    setIsRunModalOpen(true);
    // clear previous output
    setNodes((nds) =>
      nds.map((n) => ({
        ...n,
        data: { ...n.data, streamingText: "" },
      }))
    );

    try {
      const res = await fetch("/api/run-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agent,
          input: "start",
        }),
      });

      if (!res.body) return;

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;

          const json = line.slice(6).trim();
          if (json === "[DONE]") break;

          try {
            const chunk = JSON.parse(json);
            const { mode, data } = chunk;

            if (mode === "messages") {
              const [token, meta] = data;
              const nodeId = meta?.langgraph_node;
              const content = token?.content || "";

              if (nodeId && content) {
                setNodes((nds) =>
                  nds.map((n) =>
                    n.id === nodeId
                      ? {
                        ...n,
                        data: {
                          ...n.data,
                          streamingText:
                            (n.data.streamingText || "") + content,
                        },
                      }
                      : n
                  )
                );
              }
            }

            if (mode === "updates") {
              const nodeId = Object.keys(data)[0];
              const update = data[nodeId];

              if (nodeId && update) {
                const text =
                  update.output || update.last || JSON.stringify(update);

                setNodes((nds) =>
                  nds.map((n) =>
                    n.id === nodeId
                      ? {
                        ...n,
                        data: { ...n.data, streamingText: text },
                      }
                      : n
                  )
                );
              }
            }
          } catch (e) {
            console.error("Parse error", e);
          }
        }
      }
    } catch (err) {
      console.error(err);
    }
  };


  const agent = useMemo(() => {
    const map = {};
    nodes.forEach((n) => (map[n.id] = n.data));
    return { nodes: map, edges };
  }, [nodes, edges]);

  return (
    <div className="flex h-screen bg-black font-sans selection:bg-purple-500/30">
      {/* PREMIUM VOICE OVERLAY */}
      {isVoiceActive && (
        <div className="absolute top-6 left-1/2 -translate-x-1/2 z-50 animate-in fade-in zoom-in duration-300">
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-full px-6 py-3 flex items-center gap-4 shadow-2xl shadow-purple-500/20">
            <div className="relative">
              <div className={`w-3 h-3 rounded-full ${voiceStatus === "Agent Speaking" ? "bg-blue-400" : "bg-purple-500"} animate-pulse`} />
              <div className={`absolute -inset-1 rounded-full ${voiceStatus === "Agent Speaking" ? "bg-blue-400/50" : "bg-purple-500/50"} animate-ping opacity-75`} />
            </div>

            <div className="flex flex-col">
              <span className="text-[10px] uppercase tracking-widest text-gray-400 font-bold leading-none">Duffr Voice Core</span>
              <span className="text-sm font-medium text-white">{voiceStatus}</span>
            </div>

            <div className="h-6 w-px bg-white/10 mx-2" />

            <button
              onClick={() => roomRef.current?.disconnect()}
              className="bg-red-500/20 hover:bg-red-500/40 text-red-400 text-xs px-4 py-1.5 rounded-full border border-red-500/30 transition-all active:scale-95"
            >
              End Session
            </button>
          </div>
        </div>
      )}

      {/* LEFT */}
      <div className="w-[200px] bg-gray-900 p-2 space-y-2">
        <div className="text-xs text-gray-400">Agent ID</div>
        <input
          value={agentId}
          onChange={(e) => setAgentId(e.target.value)}
          className="w-full p-1 bg-gray-800 text-white text-sm"
        />
        <button onClick={loadAgent} disabled={isLoading} className="w-full bg-gray-600 p-1 text-xs">
          {isLoading ? "Loading..." : "Load Agent"}
        </button>
        <button onClick={saveAgent} disabled={isSaving} className="w-full bg-green-600 p-1 text-xs">
          {isSaving ? "Saving..." : "Save Agent"}
        </button>

        <div className="border-t border-gray-700 my-2" />

        <button onClick={() => addNode("llm")} className="w-full bg-gray-700 p-2">+ LLM</button>
        <button onClick={() => addNode("decision")} className="w-full bg-gray-700 p-2">+ Decision</button>
        <button onClick={() => addNode("tool")} className="w-full bg-gray-700 p-2">+ Tool</button>

        <div className="border-t border-gray-700 my-2" />

        <button onClick={runAgent} className="w-full bg-blue-600 p-2 font-bold">
          Run Agent
        </button>
        <button
          onClick={startVoiceCall}
          className={`w-full p-2 font-bold transition-all duration-300 rounded-lg flex items-center justify-center gap-2 ${isVoiceActive
            ? "bg-red-600/20 text-red-400 border border-red-600/30 hover:bg-red-600/30"
            : "bg-purple-600 text-white hover:bg-purple-700 shadow-lg shadow-purple-600/20 active:scale-95"
            }`}
        >
          {isVoiceActive ? (
            <>
              <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
              Stop Voice
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
              Start Voice Call
            </>
          )}
        </button>

        <div className="border-t border-gray-700 my-2" />

        {/* TEST VOICE INPUT */}
        <textarea
          id="testVoiceInput"
          placeholder="Type message..."
          className="w-full p-2 bg-black text-white text-sm h-16"
        />
        <button
          onClick={async () => {
            const input = (document.getElementById("testVoiceInput") as HTMLInputElement)?.value;
            if (!input) return;

            const res = await fetch("/api/run-agent", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ agent, input }),
            });

            if (!res.body) return;

            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";
            let output = "";

            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split("\n");
              buffer = lines.pop() || "";

              for (const line of lines) {
                if (!line.startsWith("data: ")) continue;
                const json = line.slice(6).trim();
                if (json === "[DONE]") break;

                try {
                  const chunk = JSON.parse(json);
                  if (chunk.mode === "messages") {
                    output += chunk.data[0]?.content || "";
                  }
                } catch { }
              }
            }

            // Show in visible div instead of alert
            const outputDiv = document.getElementById("testOutput");
            if (outputDiv) {
              outputDiv.textContent = output || "(empty)";
              outputDiv.style.display = "block";
            }
          }}
          className="w-full bg-green-600 p-2 font-bold mt-1"
        >
          Test Voice (Text)
        </button>

        {/* VISIBLE OUTPUT */}
        <div
          id="testOutput"
          className="mt-2 p-2 bg-gray-800 text-green-400 text-sm overflow-auto"
          style={{ display: "none", maxHeight: "100px" }}
        />
      </div>

      {/* CANVAS */}
      <div className="flex-1">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={(_, n) => setSelectedNodeId(n.id)}
          fitView
        >
          <MiniMap />
          <Controls />
          <Background />
        </ReactFlow>
      </div>

      {/* RIGHT */}
      <div className="w-[300px] bg-gray-900">
        <NodeConfigPanel
          node={nodes.find((n) => n.id === selectedNodeId)}
          onUpdate={(data) => selectedNodeId && updateNode(selectedNodeId, data)}
          onDelete={() => selectedNodeId && deleteNode(selectedNodeId)}
        />
      </div>

      {/* RUN MODAL OVERLAY */}
      <RunModal
        isOpen={isRunModalOpen}
        onClose={() => setIsRunModalOpen(false)}
        nodes={nodes}
        config={agent}
      />

      {/* DEBUG */}
      <div className=" select-all absolute bottom-0 right-0 w-[300px] h-[200px] overflow-auto bg-black text-green-400 text-xs p-2 opacity-50">
        {JSON.stringify(agent, null, 2)}
      </div>
    </div>
  );
}