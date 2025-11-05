import { NextResponse } from "next/server";

export async function POST() {
  try {
    const pinataJwt = process.env.PINATA_JWT;

    if (!pinataJwt) {
      console.error("PINATA_JWT environment variable is not set");
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    // Generate one-time JWT for upload
    const response = await fetch("https://api.pinata.cloud/users/generateApiKey", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${pinataJwt}`,
      },
      body: JSON.stringify({
        keyName: `Upload-${Date.now()}`,
        maxUses: 1,
        permissions: {
          endpoints: {
            pinning: {
              pinFileToIPFS: true,
              pinJSONToIPFS: false,
              pinJobs: false,
              unpin: false,
              userPinPolicy: false,
            },
          },
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Failed to generate Pinata JWT:", errorText);
      throw new Error("Failed to generate upload token");
    }

    const { JWT } = await response.json();
    return NextResponse.json({ jwt: JWT });
  } catch (error) {
    console.error("IPFS JWT generation error:", error);
    return NextResponse.json({ error: "Failed to generate upload token" }, { status: 500 });
  }
}
