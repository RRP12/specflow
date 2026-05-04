# Voice AI Agent - How It Works

## The Flow

```
[ USER ]                      [ LIVEKIT CLOUD ]                     [ YOUR AGENT ]
    |                                 |                                   |
    | --- 🎤 Audio (WebRTC) --------> | --- Audio ----------------------> |
    |                                 |                                   |
    |                                 |      [ ASSEMBLYAI ]              |
    |                                 |      (Speech-to-Text)            |
    |                                 |                                   |
    |                                 |      [ YOUR API ]                |
    |                                 |      /api/run-agent              |
    |                                 |      (LangGraph Brain)          |
    |                                 |                                   |
    |                                 |      [ CARTESIA ]                |
    |                                 |      (Text-to-Speech)            |
    |                                 |                                   |
    | <--- 🔊 Audio (WebRTC) -------- | <--- Audio --------------------- |
```

## Architecture

### Your Canvas UI (`/src/app/page.tsx`)
- Visual node editor (llm, decision, tool nodes)
- Save agents → stored in `/api/agent/[agentId]`
- Test Voice (Text) → sends to `/api/run-agent`

### Your API (`/src/app/api/*`)
| Endpoint | Purpose |
|----------|---------|
| `GET/PUT/DELETE /api/agent/[agentId]` | Save/Load agent config |
| `POST /api/run-agent` | Run agent with streaming response |
| `POST /api/webhook/[agentId]` | Webhook endpoint |

### Agent Runner (`/src/lib/agent-runner.ts`)
- `buildAgent()` - compiles LangGraph from node config
- `runAgent()` - streams via SSE

### Voice Worker (`voice-worker.py`)
Python worker that connects LiveKit rooms to YOUR API.

```
voice-worker.py
    │
    ├── 1. Joins LiveKit room
    ├── 2. Listens for audio
    ├── 3. Sends to AssemblyAI → gets text
    ├── 4. Calls YOUR /api/run-agent → streams response
    ├── 5. Sends text to Cartesia → gets audio
    ├── 6. Plays audio back to user
    └── 7. Repeat
```

### Components Used
| Service | Purpose | API Key |
|---------|---------|--------|
| LiveKit | WebRTC voice cloud | `APIBtYGcg3RyDWv` |
| AssemblyAI | Speech-to-Text | `a73068f5704543c8a34024f565285c00` |
| Cartesia | Text-to-Speech | `sk_1f5qarka_ldNOaw0NiTx6Aqk9WqpJcB1n` |
| Mistral | LLM (via your API) | Your API key |

## Current vs. LangChain Plugin

### How We Do It (Custom)
```python
# voice-worker.py uses custom voice.Agent with manual STT/TTS
agent = voice.Agent(
    vad=voice.VAD.load(),
    stt=AssemblyAISTT(api_key),
    llm=None,  # We call OUR API instead!
    tts=CartesiaTTS(api_key),
)

@agent.on("user_transcript")
async def on_transcript(transcript: str):
    async for chunk in run_your_agent(agent_id, transcript):
        await agent.say(chunk)
```

### How LiveKit Docs Describe It (LangChain Plugin)
```python
# Install: uv add "livekit-agents[langchain]~=1.5"
from livekit.plugins import langchain

# Use LangGraph directly as the LLM
session = AgentSession(
    llm=langchain.LLMAdapter(graph=your_compiled_graph),
    # ... stt, tts, vad
)
```

### Difference
| Aspect | Our Approach | LangChain Plugin |
|--------|------------|---------------|
| LLM | External API call to `/api/run-agent` | Embedded LangGraph |
| Latency | ~60s (network round trip) | In-process |
| Flexibility | Your full agent logic | Must adapt to LangGraph |
| Debugging | API logs | Local |

## How to Test

### 1. Text Test (Works Now)
1. Open Canvas UI
2. Build an agent
3. Click "Test Voice (Text)"
4. See response in gray box

### 2. Voice Test (Needs Integration)
The voice worker is running but no UI to connect:
```bash
# Voice worker is registered
python voice-worker.py
# Worker URL: wss://rushikesh-wp9beeub.livekit.cloud
```

To test voice, you need:
1. A LiveKit room URL (from dashboard)
2. Embed LiveKit SDK in a page, OR
3. Use SIP phone number

## Key Files
| File | Purpose |
|------|---------|
| `src/app/page.tsx` | Canvas UI |
| `src/lib/agent-runner.ts` | buildAgent(), runAgent() |
| `src/app/api/run-agent/route.ts` | API endpoint |
| `src/app/api/agent/[agentId]/route.ts` | Agent storage |
| `voice-worker.py` | LiveKit voice worker |

## Environment Variables
```bash
# LiveKit
LIVEKIT_URL=wss://rushikesh-wp9beeub.livekit.cloud
LIVEKIT_API_KEY=APIBtYGcg3RyDWv
LIVEKIT_API_SECRET=Im8kt4iN9F3J7ZKQ8RJmVF8yfuMNCUGYnUUDJKbMOUX

# AssemblyAI
ASSEMBLYAI_API_KEY=a73068f5704543c8a34024f565285c00

# Cartesia
CARTESIA_API_KEY=sk_1f5qarka_ldNOaw0NiTx6Aqk9WqpJcB1n

# Your API
NEXT_API_URL=http://localhost:3000
```

## Next Steps
1. Create demo page with LiveKit SDK to embed voice
2. Or set up SIP phone number for incoming calls
3. Or switch to LangChain plugin approach