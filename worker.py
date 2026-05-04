import logging
from dotenv import load_dotenv

from livekit.agents import Agent, AgentSession, JobContext, WorkerOptions, cli
from livekit.plugins import langchain as lk_langchain
from livekit.plugins import silero, assemblyai, cartesia
from langchain_mistralai import ChatMistralAI
from langgraph.graph import END, START, StateGraph
from langchain_core.messages import BaseMessage
from typing import Annotated, Any, Dict, List, TypedDict
import operator

load_dotenv("voice-worker.env")
logging.basicConfig(level=logging.INFO)

MISTRAL_API_KEY = "cAdRTLCViAHCn0ddFFEe50ULu04MbUvZ"


class AgentState(TypedDict):
    messages: Annotated[List[BaseMessage], operator.add]


def create_canvas_graph():
    """Create a simple test graph."""
    workflow = StateGraph(AgentState)

    async def llm_node(state: AgentState) -> dict:
        llm = ChatMistralAI(model="mistral-small-latest", mistral_api_key=MISTRAL_API_KEY)
        response = await llm.ainvoke(state["messages"])
        return {"messages": [response]}

    workflow.add_node("llm", llm_node)
    workflow.add_edge(START, "llm")
    workflow.add_edge("llm", END)
    return workflow.compile()


async def entrypoint(ctx: JobContext):
    await ctx.connect()
    logging.info(f"Connected to room: {ctx.room.name}")

    graph = create_canvas_graph()
    logging.info("Canvas graph created")

    agent = Agent(
        llm=lk_langchain.LLMAdapter(graph=graph)
    )

    session = AgentSession(
        vad=silero.VAD.load(),
        stt=assemblyai.STT(),
        tts=cartesia.TTS(),
    )

    await session.start(agent=agent, room=ctx.room)
    logging.info("Voice agent started - speak to test!")


if __name__ == "__main__":
    cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint))
