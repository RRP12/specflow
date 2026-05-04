export interface AgentNode {
  id: string;
  type: "llm" | "decision" | "tool";
  prompt?: string;
  tools?: string[];
  condition?: string;
  name?: string;
  description?: string;
  schema?: any[];
  returnValue?: string;
  structuredOutput?: {
    enabled?: boolean;
    codeMode?: boolean;
    zodCode?: string;
    schema?: any[];
    strategy?: "provider" | "tool";
  };
}

export interface AgentEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
}

export interface Agent {
  id: string;
  name?: string;
  nodes: Record<string, AgentNode>;
  edges: AgentEdge[];
  createdAt: number;
  updatedAt: number;
}

const agents = new Map<string, Agent>();

export function saveAgent(agent: Agent): Agent {
  const existing = agents.get(agent.id);
  agent.updatedAt = Date.now();
  if (!existing) {
    agent.createdAt = Date.now();
  }
  agents.set(agent.id, agent);
  return agent;
}

export function getAgent(id: string): Agent | undefined {
  return agents.get(id);
}

export function listAgents(): Agent[] {
  return Array.from(agents.values()).sort((a, b) => b.updatedAt - a.updatedAt);
}

export function deleteAgent(id: string): boolean {
  return agents.delete(id);
}