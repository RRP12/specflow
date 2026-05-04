import { NextRequest, NextResponse } from "next/server";
import { AccessToken, RoomServiceClient } from "livekit-server-sdk";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const room = searchParams.get("room");
    const identity = searchParams.get("identity");

    if (!room || !identity) {
      return NextResponse.json(
        { error: "Missing room or identity parameter" },
        { status: 400 }
      );
    }

    // Get credentials from environment
    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    const livekitUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL || "wss://rushikesh-wp9beeub.livekit.cloud";

    if (!apiKey || !apiSecret) {
      return NextResponse.json(
        { error: "LiveKit credentials not configured" },
        { status: 500 }
      );
    }

    // Create access token
    const token = new AccessToken(apiKey, apiSecret, {
      identity,
      name: identity,
    });

    token.addGrant({
      room,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
    });

    const jwt = await token.toJwt();

    return NextResponse.json({
      token: jwt,
      url: livekitUrl,
    });
  } catch (err: any) {
    console.error("Error generating LiveKit token:", err);
    return NextResponse.json(
      { error: "Failed to generate token", details: err.message },
      { status: 500 }
    );
  }
}
