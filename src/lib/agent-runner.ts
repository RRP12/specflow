import { StateGraph, START, END, Annotation } from "@langchain/langgraph";
import { createAgent, tool, toolStrategy } from "langchain";
import { ChatMistralAI } from "@langchain/mistralai";
import * as z from "zod";
import { getStructuredSchema } from "./schema-helpers";
import { HumanMessage } from "@langchain/core/messages";

const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY || "cAdRTLCViAHCn0ddFFEe50ULu04MbUvZ";

const State = Annotation.Root({
  input: Annotation<string>(),
  history: Annotation<any[]>({
    reducer: (x, y) => x.concat(y),
    default: () => [],
  }),
  last: Annotation<any>(),
  output: Annotation<any>(),
});

function matchCondition(condition: string, value: any): boolean {
  if (!condition) return true;
  // Simple matching logic: "status === 'success'" or "result > 10"
  // For now, let's support basic equality and existence
  try {
    const trimmed = condition.trim();
    if (trimmed === "true") return true;
    if (trimmed === "false") return false;

    // Check if it looks like a comparison: key === value
    const match = trimmed.match(/^(\w+)\s*(===|==|!=|>|<|>=|<=)\s*(.*)$/);
    if (match) {
      const [_, key, op, rawVal] = match;
      const val = rawVal.replace(/['"]/g, "").trim();
      const targetVal = value && typeof value === 'object' ? value[key] : value;

      switch (op) {
        case "===":
        case "==": return String(targetVal) === val;
        case "!=": return String(targetVal) !== val;
        case ">": return Number(targetVal) > Number(val);
        case "<": return Number(targetVal) < Number(val);
        case ">=": return Number(targetVal) >= Number(val);
        case "<=": return Number(targetVal) <= Number(val);
      }
    }

    // Default: check if value matches the condition string exactly
    return String(value) === trimmed;
  } catch (e) {
    console.error("Condition error:", e);
    return false;
  }
}

function buildOutgoing(edges: any[]) {
  const map: Record<string, any[]> = {};
  for (const e of edges) {
    if (!map[e.source]) map[e.source] = [];
    map[e.source].push(e);
  }
  return map;
}

function findStartNode(nodes: Record<string, any>, edges: any[]) {
  const targets = new Set(edges.map((e) => e.target));
  return Object.keys(nodes).find((nodeId) => !targets.has(nodeId));
}

function createToolFromNode(toolNodeData: any) {
  const { name, description, schema, returnValue, toolType } = toolNodeData;
  const schemaFields: Record<string, any> = {};
  if (schema && Array.isArray(schema)) {
    for (const field of schema) {
      const { name: fieldName, type, description: fieldDesc } = field;
      if (type === "string") schemaFields[fieldName] = z.string().describe(fieldDesc || "");
      else if (type === "number") schemaFields[fieldName] = z.number().describe(fieldDesc || "");
      else if (type === "boolean") schemaFields[fieldName] = z.boolean().describe(fieldDesc || "");
    }
  }

  return tool(async (input: any) => {
    console.log(`Executing tool: ${name}`, input);

    // Real tool logic based on toolType or name
    if (name.toLowerCase().includes("calculator")) {
      const { expression } = input;
      try { return { result: eval(expression) }; } catch { return { error: "Invalid expression" }; }
    }

    if (name.toLowerCase().includes("search")) {
      return { result: `Search results for: ${input.query || "unknown"}. (Simulated real search)` };
    }

    return returnValue || `Result from ${name}`;
  }, {
    name,
    description: description || `Tool: ${name}`,
    schema: z.object(schemaFields),
  });
}

function createNodeExecutor(node: any, tools: any[] = []) {
  if (node.type === "llm" || node.type === "agent") {
    return async (state: typeof State.State) => {
      const strategy = node.structuredOutput?.strategy;
      const useCodeMode = node.structuredOutput?.codeMode && node.structuredOutput?.zodCode;
      const useProvider = node.structuredOutput?.enabled && strategy === "provider";
      const useTool = node.structuredOutput?.enabled && (strategy === "tool" || useCodeMode);
      const useStructured = useProvider || useTool;

      const model = node.mistralApiKey
        ? new ChatMistralAI({
          model: useProvider ? "mistral-large-latest" : (node.model || "mistral-small-latest"),
          apiKey: node.mistralApiKey,
        })
        : new ChatMistralAI({
          model: useProvider ? "mistral-large-latest" : "mistral-small-latest",
          apiKey: MISTRAL_API_KEY,
        });

      const zodSchema = useStructured ? getStructuredSchema(node.structuredOutput) : null;

      // Build context from history
      const historyContext = state.history.map(h => `${h.type === 'tool' ? 'Tool Output' : 'Step'}: ${JSON.stringify(h.result || h.output)}`).join("\n");
      const prompt = `Context:\n${historyContext}\n\nUser Input: ${state.input}\n\nTask: ${node.prompt || "process"}`;

      if (useProvider && zodSchema) {
        const response = await model.invoke(prompt, {
          response_format: { type: "json_object" },
        });
        return {
          ...state,
          last: response.content,
          output: response.content,
          history: [{ node: node.id, type: "llm", output: response.content }]
        };
      }

      if (tools.length > 0) {
        const agent = createAgent({ model, tools });
        const result = await agent.invoke(prompt);
        return {
          ...state,
          last: result,
          output: result,
          history: [{ node: node.id, type: "agent", output: result }]
        };
      }

      const response = await model.invoke(prompt);
      return {
        ...state,
        last: response.content,
        output: response.content,
        history: [{ node: node.id, type: "llm", output: response.content }]
      };
    };
  }

  if (node.type === "decision") {
    return async (state: typeof State.State) => {
      const result = matchCondition(node.condition, state.last);
      return {
        ...state,
        last: result,
        history: [{ node: node.id, type: "decision", result }],
      };
    };
  }

  return async (state: typeof State.State) => state;
}

export function buildLangGraph(agentConfig: any) {
  const { nodes, edges } = agentConfig;
  const graph = new StateGraph({ state: State });
  const outgoing = buildOutgoing(edges);

  const toolInstances: Record<string, any> = {};
  Object.values(nodes).forEach((node: any) => {
    if (!node || !node.id) return;
    if (node.type === "tool") {
      toolInstances[node.id] = createToolFromNode(node);
    }
  });

  Object.values(nodes).forEach((node: any) => {
    if (!node || !node.id) return;
    graph.addNode(node.id, createNodeExecutor(node, []));
  });

  Object.values(nodes).forEach((node: any) => {
    const outs = outgoing[node.id] || [];
    if (outs.length === 0) {
      graph.addEdge(node.id, END);
    } else {
      outs.forEach((e: any) => {
        if (e.target) graph.addEdge(node.id, e.target);
      });
    }
  });

  const startNodeId = findStartNode(nodes, edges);
  if (!startNodeId) throw new Error("No start node found");
  graph.addEdge(START as any, startNodeId as any);

  return graph.compile();
}

export interface RunAgentOptions {
  agent: any;
  input: string;
  trigger?: string;
  agentId?: string;
}

export async function runAgent({ agent, input, trigger = "api", agentId }: RunAgentOptions): Promise<ReadableStream> {
  const app = buildLangGraph(agent);
  const stream = await app.stream({ input: input || "start" }, {
    streamMode: ["updates", "messages"],
  });

  const encoder = new TextEncoder();
  const timestamp = Date.now();

  const readable = new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode(
        `data: ${JSON.stringify({ type: "meta", agentId, trigger, timestamp })}\n\n`
      ));

      try {
        for await (const chunk of stream) {
          const [mode, data] = chunk as unknown as [string, any];

          if (mode === "messages") {
            controller.enqueue(encoder.encode(
              `data: ${JSON.stringify({ type: "chunk", mode: "messages", data })}\n\n`
            ));
          } else if (mode === "updates") {
            controller.enqueue(encoder.encode(
              `data: ${JSON.stringify({ type: "chunk", mode: "updates", data })}\n\n`
            ));
          }
        }
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`));
      } catch (err: any) {
        controller.enqueue(encoder.encode(
          `data: ${JSON.stringify({ type: "error", message: err.message })}\n\n`
        ));
        controller.close();
      }
    },
  });

  return readable;
}

export function extractInputFromBody(body: any, inputField?: string): string {
  if (!inputField) return body.input || body.text || body.message || "";
  const parts = inputField.split(".");
  let value: any = body;
  for (const part of parts) {
    value = value?.[part];
  }
  return typeof value === "string" ? value : "";
}