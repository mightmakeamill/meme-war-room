
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  // This endpoint expects JSON metadata and a base64-encoded image.
  // The browser should send: { name, symbol, description, imageBase64, imageType }
  try {
    if (!process.env.PINATA_JWT) {
      return res.status(500).json({ error: "Pinata is not configured" });
    }

    const { name, symbol, description, imageBase64, imageType } = req.body || {};

    if (!name || !symbol || !description || !imageBase64 || !imageType) {
      return res.status(400).json({ error: "Missing required token details or image" });
    }

    const allowedTypes = ["image/png", "image/jpeg", "image/webp", "image/gif"];
    if (!allowedTypes.includes(imageType)) {
      return res.status(400).json({ error: "Unsupported image type" });
    }

    const imageBuffer = Buffer.from(imageBase64, "base64");
    if (!imageBuffer.length || imageBuffer.length > 5 * 1024 * 1024) {
      return res.status(400).json({ error: "Image must be under 5 MB" });
    }

    const imageBlob = new Blob([imageBuffer], { type: imageType });
    const imageForm = new FormData();
    imageForm.append("file", imageBlob, "token-art");

    const imageResponse = await fetch(
      "https://uploads.pinata.cloud/v3/files",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.PINATA_JWT}`,
        },
        body: imageForm,
      }
    );

    const imageResult = await imageResponse.json();
    if (!imageResponse.ok) {
      console.error("Pinata image upload failed:", imageResult);
      return res.status(502).json({ error: "Image upload failed" });
    }

    const cid = imageResult.data?.cid || imageResult.IpfsHash;
    if (!cid) {
      return res.status(502).json({ error: "Pinata did not return an image CID" });
    }

    const metadata = {
      name,
      symbol,
      description,
      image: `https://gateway.pinata.cloud/ipfs/${cid}`,
      properties: {
        files: [{ uri: `https://gateway.pinata.cloud/ipfs/${cid}`, type: imageType }],
        category: "image",
      },
    };

    const metadataResponse = await fetch(
      "https://api.pinata.cloud/pinning/pinJSONToIPFS",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.PINATA_JWT}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(metadata),
      }
    );

    const metadataResult = await metadataResponse.json();
    if (!metadataResponse.ok || !metadataResult.IpfsHash) {
      console.error("Pinata metadata upload failed:", metadataResult);
      return res.status(502).json({ error: "Metadata upload failed" });
    }

    return res.status(200).json({
      imageUri: `https://gateway.pinata.cloud/ipfs/${cid}`,
      metadataUri: `https://gateway.pinata.cloud/ipfs/${metadataResult.IpfsHash}`,
    });
  } catch (error) {
    console.error("Upload endpoint error:", error);
    return res.status(500).json({ error: "Upload failed unexpectedly" });
  }
}

