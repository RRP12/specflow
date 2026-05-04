# 🔊 Voice AI Agent with LiveKit

## How LiveKit Voice Works (The Pipeline)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     LIVEKIT VOICE PIPELINE                              │
└─────────────────────────────────────────────────────────────────────────────┘

   USER          LIVEKIT              AGENT            BACKEND
   ────          ────────              ────            ──────

 ┌──────┐                         ┌──────────────┐
 │ 👤  │  🎤 audio               │              │  HTTP POST
 │ You │───────────────────►LiveKit───────►  /api/run-agent
 │speak │                        │              │   (your agent)
 │     │◄─────────────────── LiveKit◄───────        │
 │     │  🔊 audio               │              │  returns:
 └────┘                         │              │  streaming text
                                 │              │
                                 └──────────────┘
                                       │
                                       ▼
                              ┌────────────────┐
                              │  STT → LLM → TTS│
                              │  (voice worker) │
                              └────────────────┘


FULL PIPELINE (Every voice call flows through ALL stages):
─────────────────────────────────────────────────────────

      ┌──────────────┐
      │   USER      │
      │  speaks 🎤  │
      └──────┬───────┘
             │ raw audio (WebRTC/UDP)
             ▼
      ┌──────────────┐
      │    VAD       │ ◄── Voice Activity Detection
      │ (Silero)     │     "is user still speaking?"
      └──────┬───────┘
             │ audio chunks
             ▼
      ┌──────────────┐
      │     STT      │ ◄── Speech-to-Text
      │(AssemblyAI) │     "hello" → "Hello, how can I help?"
      └──────┬───────┘
             │ transcribed text
             ▼
      ┌──────────────┐
      │     LLM      │ ◄── Your Agent (built in Canvas!)
      │  (Mistral)   │     processes with your LangGraph
      └──────┬───────┘
             │ text response
             ▼
      ┌──────────────┐
      │     TTS      │ ◄── Text-to-Speech
      │ (Cartesia)   │     "Hello!" → 🎤 audio
      └──────┬───────┘
             │ audio stream
             ▼
      ┌──────────────┐
      │   USER      │
      │  hears 🔊   │
      └─────────────┘

Latency Target: < 1 second total (400ms ideal)
────────────────��────────────────────────────────────────
```

## What We Built

### System Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         WHAT WE BUILT                                    │
└─────────────────────────────────────────────────────────────────────────┘

   +----------------+     +------------------+     +-------------------+
   │   CANVAS UI    │     │   RUN-AGENT API  │     │  VOICE WORKER    │
   │  /page.tsx   │────►│ /api/run-agent  │────►│ voice-worker.py │
   │              │     │                 │     │                 │
   │ [Build]     │     │ - Mistral LLM   │     │ - AssemblyAI   │
   │ [Save]      │     │ - LangGraph     │     │ - Cartesia TTS  │
   │ [Load]      │     │ - SSE stream    │     │ - LiveKit room  │
   │ [Test Text] │     │                 │     │                 │
   └─────────────┘     └─────────────────┘     └─────────────────┘
          │                    │                       │
          │ config            │                       │
          ▼                   ▼                       ▼
   +----------------+  +------------------+   +-------------------+
   │ /api/agent/   │  │ Connects to      │   │ Registers as     │
   │  [agentId]   │  │ Mistral API    │   │ wss://rushikesh- │
   │              │  │ via langchain │   │ wp9beeub.livekit│
   │ save agents  │  │                 │   │ .cloud          │
   │ load agents │  └─────────────────┘   └───────────────────┘
   └─────────────┘
```

### Components Created

| File | Purpose |
|------|---------|
| `/src/app/page.tsx` | Canvas UI with llm/decision/tool nodes |
| `/src/lib/agent-runner.ts` | Builds LangGraph, runs agents |
| `/src/app/api/run-agent/route.ts` | API endpoint for running agents |
| `/src/app/api/agent/[agentId]/route.ts` | Save/Load agents to memory |
| `/voice-worker.py` | LiveKit voice worker (Python) |

### What Currently Works ✅

1. **Canvas UI** - Build agents with nodes (llm, decision, tool)
2. **Save/Load Agents** - Persist to in-memory store
3. **Run Agent API** - Text in, streaming text response (SSE)
4. **Voice Worker** - Registered with LiveKit

### What's NOT Connected ⚠️

The "Start Voice Call" button in Canvas UI does NOT actually make voice calls. It only tests with text input.

To make voice work, you need:
- A **frontend page** that embeds LiveKit SDK (connect to room)
- Or a **phone number** (SIP) that routes to LiveKit

## How to Actually Make Voice Calls

### Option 1: Build a Frontend Demo Page

```bash
# Clone LiveKit's embed starter
lk app create --template agent-starter-embed

# Configure with your credentials
# Then open the page and speak!
```

### Option 2: Use a Phone Number

```
1. Get a LiveKit phone number (SIP)
2. Call the number
3. Routes to your voice worker
```

### Option 3: Embed LiveKit SDK Directly

```typescript
// In a Next.js page:
// 1. Connect to LiveKit room
// 2. Publish microphone track
// 3. Subscribe to agent's audio track
// 4. Voice flows through the worker
```

## LiveKit Architecture Key Terms

| Term | Meaning |
|------|---------|
| **Room** | A WebRTC session where users and agents meet |
| **Participant** | Someone in the room (user or AI agent) |
| **Track** | Audio/video stream (publish/subscribe) |
| **SFU** | Selective Forwarding Unit - routes media |
| **Worker/Agent** | Python/Node process that joins rooms |
| **VAD** | Voice Activity Detection |
| **STT** | Speech-to-Text |
| **TTS** | Text-to-Speech |

## Diagram: How the Voice Worker Registers

```
                    ┌────────────────────────┐
                    │   LIVEKIT CLOUD       │
                    │  wss://rushikesh-     │
                    │  wp9beeub.livekit.cloud│
                    └──────────┬─────────────┘
                               │
        HTTP POST               │  WebSocket
        /register             │  (persistent)
        ────────►             ◄───────
              ▲                    │
              │                   ▼
   ┌──────────┴──────────┐  ┌─────────────┐
   │  voice-worker.py   │  │   Room 1   │
   │ (Python 3.12)     │  │   Room 2   │
   │                   │  │   Room 3   │
   │ Registers as:      │  │   ...     │
   │ "rushikesh-agent" │  └─────────────┘
   └───────────────────┘

When user joins a LiveKit room → LiveKit sends job to worker → Worker runs agent
```

## Next Steps (If You Want Voice to Actually Work)

1. **Create demo page with LiveKit SDK**
2. **Connect demo page to your voice worker**
3. **Test with actual microphone**

The voice worker is already running and registered - just needs a frontend to connect to it!

## Environment Variables

```
LIVEKIT_URL=wss://rushikesh-wp9beeub.livekit.cloud
LIVEKIT_API_KEY=APIBtYGcg3RyDWv
LIVEKIT_API_SECRET=Im8kt4iN9F3J7ZKQ8RJmVF8yfuMNCUGYnUUDJKbMOUX
ASSEMBLYAI_API_KEY=a73068f5704543c8a34024f565285c00
CARTESIA_API_KEY=sk_1f5qarka_ldNOaw0NiTx6Aqk9WqpJcB1n
NEXT_API_URL=http://localhost:3000
```

## Running the Voice Worker

```bash
# Activate virtual environment
source venv/bin/activate

# Run the worker
python voice-worker.py

# It registers with LiveKit and awaits room connections
```

---

**TL;DR**: Your voice worker is running and registered with LiveKit. The Canvas UI doesn't have a way to connect to it yet - that's what we'd need to build next if you want voice to actually work.