
import { GoogleGenAI, Modality } from "@google/genai";

// Menonaktifkan peringatan eksperimental jika perlu
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

// --- Logika Pool Kunci API yang Ditingkatkan ---

const apiKeys = (process.env.API_KEYS_POOL || process.env.API_KEY || '')
  .split(',')
  .map(k => k.trim())
  .filter(Boolean);

let currentKeyIndex = 0;

function getNextApiKey() {
  if (apiKeys.length === 0) return null;
  const key = apiKeys[currentKeyIndex];
  currentKeyIndex = (currentKeyIndex + 1) % apiKeys.length;
  return key;
}

// --- Handler Utama ---

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  if (apiKeys.length === 0) {
    console.error("[Generate] Tidak ada kunci API yang dikonfigurasi di server.");
    return res.status(500).json({ error: 'API key not configured on the server. Please set API_KEY or API_KEYS_POOL environment variables.' });
  }

  const { prompt, imageParts } = req.body;

  if (!prompt || !imageParts || !Array.isArray(imageParts) || imageParts.length === 0) {
    return res.status(400).json({ error: 'Missing required fields: prompt and imageParts' });
  }
  
  const totalKeys = apiKeys.length;
  for (let i = 0; i < totalKeys; i++) {
    const apiKey = getNextApiKey();
    if (!apiKey) continue;

    console.log(`[Generate] Mencoba permintaan dengan kunci API yang berakhiran ...${apiKey.slice(-4)} (Percobaan ${i + 1}/${totalKeys})`);

    try {
      const modelName = 'gemini-2.5-flash-image-preview';
      const modelConfig = {
        responseModalities: [Modality.IMAGE, Modality.TEXT],
      };

      const ai = new GoogleGenAI({ apiKey });
      const userContent = {
        parts: [...imageParts, { text: prompt }],
      };

      const response = await ai.models.generateContent({
        model: modelName,
        contents: userContent,
        config: modelConfig,
      });

      const candidate = response.candidates?.[0];

      if (!candidate) {
        throw new Error("No response from the API. The request might have been blocked.");
      }

      if (candidate.finishReason === 'SAFETY') {
        console.warn(`[Generate] Permintaan diblokir karena kebijakan keamanan dengan kunci ...${apiKey.slice(-4)}`);
        return res.status(400).json({ error: "Image generation failed. The prompt or image may have violated safety policies. Please adjust your input and try again." });
      }

      let imageData = null;
      let responseText = '';

      for (const part of candidate.content?.parts || []) {
        if (part.inlineData && part.inlineData.data) {
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
        console.log(`[Generate] Berhasil dengan kunci ...${apiKey.slice(-4)}`);
        return res.status(200).json(imageData);
      } else {
        const errorMessage = responseText 
          ? `API returned text instead of an image: "${responseText.trim()}"`
          : "API did not return an image. It might have been blocked due to safety settings or a prompt issue.";
        console.error(`[Generate] Gagal mendapatkan gambar dengan kunci ...${apiKey.slice(-4)}. Pesan: ${errorMessage}`);
        // Return a 500 status for this case, as it's an unexpected API response
        return res.status(500).json({ error: errorMessage });
      }

    } catch (error) {
      const isRateLimitError = error.message && (error.message.includes('429') || error.message.toLowerCase().includes('resource has been exhausted'));
      
      if (isRateLimitError) {
        console.warn(`[Generate] Kunci ...${apiKey.slice(-4)} terkena batas penggunaan.`);
        if (i === totalKeys - 1) {
          console.error("[Generate] SEMUA KUNCI habis. Mengirim galat 429 ke klien.");
          return res.status(429).json({ error: 'All API keys are currently rate-limited. Please wait a moment.' });
        }
        // Lanjutkan ke iterasi berikutnya untuk mencoba kunci lain
      } else {
        console.error(`[Generate] Galat tak terduga dengan kunci ...${apiKey.slice(-4)}:`, error);
        const detailedError = error.message || "An unknown error occurred";
        return res.status(500).json({ error: `Failed to generate content: ${detailedError}` });
      }
    }
  }
}
