import { NextResponse } from "next/server";
import { listAgents } from "@/lib/agent-store";

export async function GET() {
  try {
    const agents = listAgents();
    return NextResponse.json({ agents });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}