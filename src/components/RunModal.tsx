'use client';

/**
 * RunModal — connects to the FastAPI backend (port 8000).
 * The canvas graph config is passed as canvas_graph in the request body.
 */

import { useState, useRef, useCallback } from 'react';

const API_URL = 'http://localhost:8000';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

interface RunModalProps {
  isOpen: boolean;
  onClose: () => void;
  nodes: any[];
  config: any;           // the canvas {nodes, edges} object
}

// ─── FastAPI-based chat hook ────────────────────────────────────────────────
function useAgentChat(canvasConfig: any) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [status, setStatus] = useState<'idle' | 'streaming' | 'error'>('idle');
  const abortRef = useRef(false);
  const threadIdRef = useRef<string | null>(null);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || status === 'streaming') return;

    // Optimistic UI — show user bubble + empty assistant bubble immediately
    const userMsg: Message = { id: crypto.randomUUID(), role: 'user', content: text };
    const assistantId = crypto.randomUUID();
    const assistantMsg: Message = { id: assistantId, role: 'assistant', content: '' };

    setMessages(prev => [...prev, userMsg, assistantMsg]);
    setStatus('streaming');
    abortRef.current = false;

    try {
      // Create (or reuse) a thread
      if (!threadIdRef.current) {
        const res = await fetch(`${API_URL}/threads`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
        const data = await res.json();
        threadIdRef.current = data.thread_id;
      }

      // Transform canvas config to backend format
      const transformedConfig = transformCanvasConfig(canvasConfig);

      // Send message
      const res = await fetch(`${API_URL}/threads/${threadIdRef.current}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          canvas_graph: transformedConfig,
        }),
      });

      if (!res.ok) throw new Error('Failed to send message');

      const data = await res.json();

      // Update with assistant response
      if (data.messages && data.messages.length > 0) {
        const lastMsg = data.messages[data.messages.length - 1];
        setMessages(prev =>
          prev.map(m =>
            m.id === assistantId ? { ...m, content: lastMsg.content } : m
          )
        );
      }

    } catch (err: any) {
      if (!abortRef.current) {
        setMessages(prev =>
          prev.map(m =>
            m.id === assistantId
              ? { ...m, content: '⚠️ ' + (err?.message ?? 'Request error') }
              : m
          )
        );
        setStatus('error');
        return;
      }
    }

    setStatus('idle');
  }, [canvasConfig, status]);

  const stop = useCallback(() => {
    abortRef.current = true;
    setStatus('idle');
  }, []);

  const reset = useCallback(() => {
    threadIdRef.current = null;
    setMessages([]);
    setStatus('idle');
  }, []);

  return { messages, sendMessage, status, stop, reset };
}

// ─── Transform canvas config to backend format ─────────────────────────────
function transformCanvasConfig(config: any) {
  if (!config || !config.nodes) return config;

  const nodes: any = {};

  for (const [id, node] of Object.entries(config.nodes)) {
    const n = node as any;
    const nodeConfig: any = {
      type: n.type || 'llm',
      model: n.model || 'mistral-small-latest',
      prompt: n.prompt || 'You are a helpful assistant. Respond briefly.',
    };

    // Pass structured output config if enabled
    if (n.structuredOutput?.enabled) {
      nodeConfig.structuredOutput = {
        enabled: true,
        jsonSchema: n.structuredOutput.jsonSchema || convertZodToJsonSchema(n.structuredOutput.zodCode),
      };
    }

    nodes[id] = nodeConfig;
  }

  return { nodes, edges: config.edges || [] };
}

// Simple Zod to JSON schema converter (handles basic cases)
function convertZodToJsonSchema(zodCode: string): any {
  if (!zodCode) return null;

  const schema: any = { type: 'object', properties: {}, required: [] };

  try {
    // Extract content between z.object({ and })
    const objectMatch = zodCode.match(/z\.object\(\{([\s\S]*)\}\)/);
    if (!objectMatch) return schema;

    const fieldsStr = objectMatch[1];

    // Match individual field definitions
    // Pattern: fieldName: z.type().describe("description")
    const fieldRegex = /(\w+)\s*:\s*z\.(\w+)\([^)]*\)\.describe\(["']([^"']*)["']\)/g;
    let match;

    while ((match = fieldRegex.exec(fieldsStr)) !== null) {
      const [, fieldName, fieldType, description] = match;
      const typeMap: any = {
        'string': 'string',
        'number': 'number',
        'boolean': 'boolean',
        'array': 'array',
        'object': 'object',
      };

      schema.properties[fieldName] = {
        type: typeMap[fieldType] || 'string',
        description: description,
      };
      schema.required.push(fieldName);
    }
  } catch (e) {
    console.error('Failed to parse Zod code:', e);
  }

  return schema;
}

// ─── Component ────────────────────────────────────────────────────────────────
export const RunModal: React.FC<RunModalProps> = ({ isOpen, onClose, nodes, config }) => {
  const { messages, sendMessage, status, stop, reset } = useAgentChat(config);
  const [input, setInput] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    sendMessage(input);
    setInput('');
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-8 backdrop-blur-xl bg-black/60">
      <div className="w-full max-w-5xl h-full max-h-[800px] bg-[#0A0A0A] border border-white/10 rounded-3xl shadow-[0_0_50px_rgba(0,0,0,0.5)] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-white/5 bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full transition-colors ${status === 'streaming' ? 'bg-green-500 animate-pulse' :
                status === 'error' ? 'bg-red-500' : 'bg-gray-600'
              }`} />
            <h2 className="text-white font-bold tracking-tight">Agent Execution Environment</h2>
            {status === 'streaming' && (
              <span className="text-[10px] text-green-400 uppercase tracking-widest animate-pulse">streaming…</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={reset}
              className="px-3 py-1.5 hover:bg-white/5 rounded-lg transition-colors text-gray-500 hover:text-white text-xs">
              New thread
            </button>
            <button onClick={onClose}
              className="p-2 hover:bg-white/5 rounded-xl transition-colors text-gray-500 hover:text-white">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="flex-1 flex overflow-hidden">

          {/* Chat */}
          <div className="flex-1 flex flex-col p-6 overflow-hidden">
            <div className="flex-1 overflow-y-auto space-y-4 mb-4 pr-1">
              {messages.length === 0 && (
                <div className="text-gray-600 text-sm text-center mt-12">
                  Send a message to run the agent.
                </div>
              )}
              {messages.map(m => (
                <div key={m.id} className={`p-4 rounded-xl border text-sm leading-relaxed ${m.role === 'user'
                    ? 'bg-white/5 border-white/10 text-gray-200'
                    : 'bg-blue-500/5 border-blue-500/20 text-blue-100'
                  }`}>
                  <div className="text-[10px] uppercase font-bold text-gray-500 mb-1 tracking-widest">
                    {m.role === 'user' ? 'You' : 'Agent'}
                  </div>
                  <div className="whitespace-pre-wrap">
                    {m.content || (
                      <span className="inline-block w-2 h-4 bg-blue-400 animate-pulse rounded-sm" />
                    )}
                  </div>
                </div>
              ))}
            </div>

            <form className="flex gap-2" onSubmit={handleSubmit}>
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder="Type a message…"
                disabled={status === 'streaming'}
                className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-white placeholder-gray-600 disabled:opacity-40 focus:outline-none focus:border-blue-500/50"
              />
              {status === 'streaming' ? (
                <button type="button" onClick={stop}
                  className="bg-red-600/80 hover:bg-red-600 px-6 py-2 rounded-xl text-white text-sm font-bold transition-colors">
                  Stop
                </button>
              ) : (
                <button type="submit" disabled={!input.trim()}
                  className="bg-blue-600 hover:bg-blue-500 disabled:opacity-40 px-6 py-2 rounded-xl text-white text-sm font-bold transition-colors">
                  Send
                </button>
              )}
            </form>
          </div>

          {/* Node trace */}
          <div className="w-[240px] border-l border-white/5 p-6 bg-white/[0.01] overflow-y-auto">
            <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-4">Canvas Nodes</h3>
            {nodes.map(n => (
              <div key={n.id} className="flex items-center gap-2 py-2 border-b border-white/5">
                <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${n.data?.type === 'llm' ? 'bg-blue-500' :
                    n.data?.type === 'decision' ? 'bg-orange-500' : 'bg-purple-500'
                  }`} />
                <div className="text-xs text-gray-500 truncate">
                  {n.data?.label || n.data?.type || n.type}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};