
import { GoogleGenAI, Modality } from "@google/genai";

// Menonaktifkan peringatan eksperimental jika perlu, meskipun lebih baik untuk menanganinya dengan benar
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // Vercel secara otomatis mengurai body JSON
  const { prompt, imageParts } = req.body;

  if (!prompt || !imageParts || !Array.isArray(imageParts) || imageParts.length === 0) {
    return res.status(400).json({ error: 'Missing required fields: prompt and imageParts' });
  }

  // FIX: API key must be read from process.env.API_KEY
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured on the server' });
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image-preview',
      contents: { parts: [...imageParts, { text: prompt }] },
      config: {
        responseModalities: [Modality.IMAGE, Modality.TEXT],
      },
    });
    
    const candidate = response.candidates?.[0];

    if (!candidate) {
      return res.status(500).json({ error: "No response from the API. The request might have been blocked." });
    }

    if (candidate.finishReason === 'SAFETY') {
      return res.status(400).json({ error: "Image generation failed. The prompt or image may have violated safety policies. Please adjust your input and try again." });
    }

    let imageData = null;
    let responseText = '';

    for (const part of candidate.content?.parts || []) {
      if (part.inlineData) {
        imageData = {
          base64: part.inlineData.data,
          mimeType: part.inlineData.mimeType,
        };
        break; 
      } else if (part.text) {
        responseText += part.text;
      }
    }

    if (imageData) {
      res.status(200).json(imageData);
    } else {
      const errorMessage = responseText 
        ? `API returned text instead of an image: "${responseText}"`
        : "API did not return an image. It might have been blocked due to safety settings or a prompt issue.";
      res.status(500).json({ error: errorMessage });
    }

  } catch (error) {
    console.error('Error calling Gemini API:', error);
    res.status(500).json({ error: `Failed to generate content: ${error.message}` });
  }
}