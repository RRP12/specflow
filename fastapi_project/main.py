"""
FastAPI wrapper for the LangGraph canvas agent.
Provides REST endpoints for interacting with the graph.
"""

from __future__ import annotations

import operator
import uuid
from typing import Annotated, Any, Dict, List, Optional, TypedDict

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage
from langchain_mistralai import ChatMistralAI
from langgraph.graph import END, START, StateGraph
from langgraph.config import get_config
from langgraph.checkpoint.memory import MemorySaver

MISTRAL_API_KEY = "cAdRTLCViAHCn0ddFFEe50ULu04MbUvZ"

# ─────────────────────────────────────────────────────────────────────────────
# State Definitions
# ─────────────────────────────────────────────────────────────────────────────
class AgentState(TypedDict):
    messages: Annotated[List[BaseMessage], operator.add]
    decision_results: Dict[str, str]


class RootState(TypedDict):
    messages: Annotated[List[BaseMessage], operator.add]


# ─────────────────────────────────────────────────────────────────────────────
# Graph Building Helpers
# ─────────────────────────────────────────────────────────────────────────────
def _build_inner_graph(canvas: Dict[str, Any]):
    """Build and compile the inner graph from canvas config."""
    nodes_cfg: Dict[str, Any] = canvas.get("nodes", {})
    edges_cfg: List[Dict] = canvas.get("edges", [])

    if not nodes_cfg:
        raise ValueError("Canvas has no nodes")

    wf = StateGraph(AgentState)

    # Register nodes
    for node_id, data in nodes_cfg.items():
        ntype = data.get("type")
        if ntype == "llm":
            wf.add_node(node_id, _make_llm_node(node_id))
        elif ntype == "decision":
            wf.add_node(node_id, _make_decision_node(node_id))
        elif ntype == "tool":
            wf.add_node(node_id, lambda s: {})

    # Wire edges
    by_src: Dict[str, List[Dict]] = {}
    for e in edges_cfg:
        by_src.setdefault(e["source"], []).append(e)

    for src, out_edges in by_src.items():
        src_type = nodes_cfg.get(src, {}).get("type")
        if src_type == "decision":
            path_map = {e.get("sourceHandle", "true"): e["target"] for e in out_edges}
            wf.add_conditional_edges(src, _make_router(src, path_map), path_map)
        else:
            for e in out_edges:
                wf.add_edge(src, e["target"])

    # Entry and exit nodes
    all_targets = {e["target"] for e in edges_cfg}
    for nid in nodes_cfg:
        if nid not in all_targets:
            wf.add_edge(START, nid)

    all_sources = set(by_src.keys())
    for nid in nodes_cfg:
        if nid not in all_sources:
            wf.add_edge(nid, END)

    return wf.compile()


def _make_llm_node(node_id: str):
    async def llm_node(state: AgentState) -> dict:
        canvas = _canvas_config()
        data = _node_data(canvas, node_id)
        model_name = data.get("model", "mistral-small-latest")
        llm = ChatMistralAI(model=model_name, mistral_api_key=MISTRAL_API_KEY)

        # Check for structured output
        structured_output = data.get("structuredOutput", {})
        if structured_output.get("enabled"):
            json_schema = structured_output.get("jsonSchema")
            if json_schema:
                # Add required title and description for Mistral
                if "title" not in json_schema:
                    json_schema["title"] = f"Node_{node_id}_output"
                if "description" not in json_schema:
                    json_schema["description"] = data.get("prompt", "Structured output")
                try:
                    llm = llm.with_structured_output(json_schema)
                except Exception as e:
                    print(f"Failed to set structured output: {e}")

        history = "\n".join(
            f"{m.type}: {m.content}" for m in state["messages"][-5:]
        )
        task = data.get("prompt", "Process the above input.")
        prompt = f"Context:\n{history}\n\nTask: {task}"
        response = await llm.ainvoke(prompt)

        # If structured output, response is a dict, convert to string for message
        if isinstance(response, dict):
            import json
            content = json.dumps(response)
        else:
            content = response.content if hasattr(response, 'content') else str(response)

        return {"messages": [AIMessage(content=content)]}
    return llm_node


def _make_decision_node(node_id: str):
    def decision_node(state: AgentState) -> dict:
        canvas = _canvas_config()
        data = _node_data(canvas, node_id)
        condition = data.get("condition", "true").strip().lower()
        if condition == "true":
            result = "true"
        elif condition == "false":
            result = "false"
        else:
            last = state["messages"][-1].content if state["messages"] else ""
            result = "true" if condition in last.lower() else "false"
        return {"decision_results": {**state.get("decision_results", {}), node_id: result}}
    return decision_node


def _make_router(node_id: str, path_map: Dict[str, str]):
    def router(state: AgentState) -> str:
        return path_map.get(state.get("decision_results", {}).get(node_id, "true"), END)
    return router


def _canvas_config() -> Dict[str, Any]:
    cfg = get_config()
    return cfg.get("configurable", {}).get("canvas_graph", {})


def _node_data(canvas: Dict, node_id: str) -> Dict:
    return canvas.get("nodes", {}).get(node_id, {})


# ─────────────────────────────────────────────────────────────────────────────
# Dispatch Node
# ─────────────────────────────────────────────────────────────────────────────
async def _dispatch_node(state: RootState) -> dict:
    canvas = _canvas_config()
    if not canvas or not canvas.get("nodes"):
        return {"messages": [AIMessage(content="No canvas graph configured.")]}
    inner = _build_inner_graph(canvas)
    inner_state: AgentState = {
        "messages": state["messages"],
        "decision_results": {},
    }
    result = await inner.ainvoke(inner_state)
    new_msgs = result["messages"][len(state["messages"]):]
    return {"messages": new_msgs}


# ─────────────────────────────────────────────────────────────────────────────
# Root Graph (compiled once, reused)
# ─────────────────────────────────────────────────────────────────────────────
checkpointer = MemorySaver()

root_graph = (
    StateGraph(RootState)
    .add_node("agent", _dispatch_node)
    .add_edge(START, "agent")
    .add_edge("agent", END)
    .compile(checkpointer=checkpointer)
)


# ─────────────────────────────────────────────────────────────────────────────
# FastAPI App
# ─────────────────────────────────────────────────────────────────────────────
app = FastAPI(title="LangGraph Canvas Agent API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory store for threads (use a database in production)
threads: Dict[str, List[BaseMessage]] = {}


# ── Request/Response Models ──────────────────────────────────────────────────
class CreateThreadRequest(BaseModel):
    canvas_graph: Optional[Dict[str, Any]] = None


class CreateThreadResponse(BaseModel):
    thread_id: str


class MessageRequest(BaseModel):
    message: str
    canvas_graph: Optional[Dict[str, Any]] = None


class MessageResponse(BaseModel):
    messages: List[Dict[str, str]]


# ── Endpoints ────────────────────────────────────────────────────────────────
@app.post("/threads", response_model=CreateThreadResponse)
async def create_thread(req: CreateThreadRequest):
    thread_id = str(uuid.uuid4())
    threads[thread_id] = []
    return CreateThreadResponse(thread_id=thread_id)


@app.post("/threads/{thread_id}/messages", response_model=MessageResponse)
async def send_message(thread_id: str, req: MessageRequest):
    if thread_id not in threads:
        raise HTTPException(status_code=404, detail="Thread not found")

    # Add user message
    user_msg = HumanMessage(content=req.message)
    threads[thread_id].append(user_msg)

    # Run the graph
    config = {"configurable": {"thread_id": thread_id}}
    if req.canvas_graph:
        config["configurable"]["canvas_graph"] = req.canvas_graph

    result = await root_graph.ainvoke(
        {"messages": threads[thread_id]},
        config=config,
    )

    # Store new messages
    new_msgs = result["messages"][len(threads[thread_id]):]
    threads[thread_id].extend(new_msgs)

    # Format response
    return MessageResponse(
        messages=[
            {"type": m.type, "content": m.content}
            for m in new_msgs
        ]
    )


@app.get("/threads/{thread_id}/messages", response_model=MessageResponse)
async def get_messages(thread_id: str):
    if thread_id not in threads:
        raise HTTPException(status_code=404, detail="Thread not found")
    return MessageResponse(
        messages=[
            {"type": m.type, "content": m.content}
            for m in threads[thread_id]
        ]
    )


@app.get("/health")
async def health():
    return {"status": "ok"}
