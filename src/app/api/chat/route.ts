import { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    
    // Proxy to FastAPI
    const response = await fetch("http://127.0.0.1:8000/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const error = await response.text();
      return new Response(error, { status: response.status });
    }

    // Pipe the stream directly back to the client
    return new Response(response.body, {
      headers: {
        "Content-Type": "text/plain",
        "X-Vercel-AI-Data-Stream": "v1",
        "Cache-Control": "no-cache",
      }
    });
  } catch (err: any) {
    console.error("Proxy Error:", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}


