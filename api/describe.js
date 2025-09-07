
import { GoogleGenAI } from "@google/genai";

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { imagePart } = req.body;

  if (!imagePart) {
    return res.status(400).json({ error: 'Missing required field: imagePart' });
  }

  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured on the server' });
  }

  try {
    const describePrompt = "Act as a professional photographer. Describe this image in vivid detail, focusing on the main subject, setting, lighting, composition, colors, and overall mood. The description should be suitable to be used as a prompt to recreate a similar image with an AI image generator.";
    
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: { parts: [imagePart, { text: describePrompt }] },
    });

    const description = response.text;
    if (description) {
      res.status(200).json({ description });
    } else {
      res.status(500).json({ error: "AI couldn't generate a description for this image." });
    }

  } catch (error)
   {
    console.error('Error calling Gemini API for description:', error);
    res.status(500).json({ error: `Failed to generate description: ${error.message}` });
  }
}