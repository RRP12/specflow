import { NextRequest, NextResponse } from "next/server";
import { runAgent } from "@/lib/agent-runner";
import * as z from "zod";

const RequestSchema = z.object({
  agent: z.object({
    nodes: z.record(z.any()),
    edges: z.array(z.any()),
    name: z.string().optional(),
  }),
  input: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const validatedData = RequestSchema.safeParse(body);

    if (!validatedData.success) {
      return NextResponse.json({ error: "Invalid request", details: validatedData.error.errors }, { status: 400 });
    }

    const { agent, input } = validatedData.data;

    console.log(`[Proxy] Routing agent run to Python Engine: ${agent.name || 'unnamed'}`);

    // Call the Python FastAPI Backend
    const pythonRes = await fetch("http://localhost:8000/run-agent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agent, input }),
    });

    if (!pythonRes.ok) {
      const errorText = await pythonRes.text();
      return NextResponse.json({ error: "Python Engine Error", details: errorText }, { status: 500 });
    }

    return new NextResponse(pythonRes.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  } catch (err: any) {
    console.error("Error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}