import json
import logging
from dotenv import load_dotenv

from livekit.agents import AgentSession, Agent, JobContext, WorkerOptions, cli
from livekit.plugins import langchain as lk_langchain

from langchain_core.messages import BaseMessage
from langchain_mistralai import ChatMistralAI
from langgraph.graph import END, START, StateGraph
from langgraph.config import get_config
import operator
from typing import Annotated, Any, Dict, List, TypedDict

load_dotenv("voice-worker.env")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("voice-agent")

MISTRAL_API_KEY = "cAdRTLCViAHCn0ddFFEe50ULu04MbUvZ"


class AgentState(TypedDict):
    messages: Annotated[List[BaseMessage], operator.add]


def build_graph(canvas_config: Dict[str, Any]):
    """Build LangGraph from canvas config."""
    nodes = canvas_config.get("nodes", {})
    edges = canvas_config.get("edges", [])

    if not nodes:
        return None

    workflow = StateGraph(AgentState)

    for nid, data in nodes.items():
        if data.get("type") == "llm":
            workflow.add_node(nid, _make_llm_node(data))

    # Simple: connect start -> first node -> end
    first = list(nodes.keys())[0]
    workflow.add_edge(START, first)
    workflow.add_edge(first, END)

    return workflow.compile()


def _make_llm_node(data: Dict[str, Any]):
    async def node(state: AgentState) -> dict:
        llm = ChatMistralAI(
            model=data.get("model", "mistral-small-latest"),
            mistral_api_key=MISTRAL_API_KEY
        )
        response = await llm.ainvoke(state["messages"])
        return {"messages": [response]}
    return node


async def entrypoint(ctx: JobContext):
    await ctx.connect()

    # Use default canvas config for testing
    config = {
        "nodes": {
            "llm1": {
                "type": "llm",
                "model": "mistral-small-latest",
                "prompt": "You are a helpful voice assistant. Keep responses brief."
            }
        },
        "edges": []
    }

    logger.info(f"Using default canvas config with {len(config['nodes'])} nodes")

    # Build graph
    graph = build_graph(config)
    if not graph:
        logger.error("No graph built")
        return

    # Create agent with LLMAdapter
    agent = Agent(
        llm=lk_langchain.LLMAdapter(graph=graph)
    )

    # Start session
    session = AgentSession()
    await session.start(agent=agent, room=ctx.room)
    logger.info("Voice agent started")


if __name__ == "__main__":
    cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint))
