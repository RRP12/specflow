import logging
from livekit.agents import Agent, AgentSession, JobContext, WorkerOptions, cli
from livekit.plugins import silero, assemblyai, cartesia

logging.basicConfig(level=logging.INFO)

async def entrypoint(ctx: JobContext):
    await ctx.connect()
    logging.info(f"Connected to room: {ctx.room.name}")

    session = AgentSession(
        vad=silero.VAD.load(),
        stt=assemblyai.STT(),
        llm=None,  # Will add later
        tts=cartesia.TTS(),
    )

    await session.start(room=ctx.room)
    logging.info("Agent started - say 'hello' to test")

if __name__ == "__main__":
    cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint))
