import logging
from livekit.agents import AgentSession, Agent, JobContext, WorkerOptions, cli

logging.basicConfig(level=logging.INFO)

async def entrypoint(ctx: JobContext):
    await ctx.connect()
    logging.info(f"Connected to room: {ctx.room.name}")

    # Minimal session without STT/TTS for now
    session = AgentSession()
    await session.start(room=ctx.room)
    logging.info("Agent started")

if __name__ == "__main__":
    cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint))
