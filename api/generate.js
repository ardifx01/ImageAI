
import { GoogleGenAI, Modality } from "@google/genai";

// Menonaktifkan peringatan eksperimental jika perlu
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

// --- Logika Pool Kunci API yang Ditingkatkan ---

// Inisialisasi pool kunci di luar handler agar state-nya tetap ada di antara pemanggilan (untuk fungsi 'hangat')
const apiKeys = (process.env.API_KEYS_POOL || process.env.API_KEY || '')
  .split(',')
  .map(k => k.trim())
  .filter(Boolean);

let currentKeyIndex = 0;

/**
 * Mendapatkan kunci API berikutnya dari pool menggunakan strategi round-robin.
 * @returns {string|null} Kunci API atau null jika tidak ada yang dikonfigurasi.
 */
function getNextApiKey() {
  if (apiKeys.length === 0) {
    return null;
  }
  const key = apiKeys[currentKeyIndex];
  // Pindahkan indeks ke kunci berikutnya untuk pemanggilan selanjutnya
  currentKeyIndex = (currentKeyIndex + 1) % apiKeys.length;
  return key;
}

// --- Handler Utama ---

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  if (apiKeys.length === 0) {
    return res.status(500).json({ error: 'API key not configured on the server. Please set API_KEY or API_KEYS_POOL environment variables.' });
  }

  const { prompt, imageParts } = req.body;

  if (!prompt || !imageParts || !Array.isArray(imageParts) || imageParts.length === 0) {
    return res.status(400).json({ error: 'Missing required fields: prompt and imageParts' });
  }
  
  // Loop coba ulang: coba setiap kunci sekali
  const totalKeys = apiKeys.length;
  for (let i = 0; i < totalKeys; i++) {
    const apiKey = getNextApiKey();
    if (!apiKey) continue; // Seharusnya tidak terjadi, tetapi sebagai pengaman

    try {
      const modelName = 'gemini-2.5-flash-image-preview';
      const modelConfig = {
        responseModalities: [Modality.IMAGE, Modality.TEXT],
      };

      const ai = new GoogleGenAI({ apiKey });
      const userContent = {
        role: "user",
        parts: [...imageParts, { text: prompt }],
      };

      const response = await ai.models.generateContent({
        model: modelName,
        contents: [userContent],
        config: modelConfig,
      });

      const candidate = response.candidates?.[0];

      if (!candidate) {
        throw new Error("No response from the API. The request might have been blocked.");
      }

      if (candidate.finishReason === 'SAFETY') {
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
        // Berhasil! Kirim respons dan hentikan loop.
        return res.status(200).json(imageData);
      } else {
        const errorMessage = responseText 
          ? `API returned text instead of an image: "${responseText.trim()}"`
          : "API did not return an image. It might have been blocked due to safety settings or a prompt issue.";
        // Ini adalah galat non-coba-ulang, jadi langsung hentikan.
        return res.status(500).json({ error: errorMessage });
      }

    } catch (error) {
      console.error(`Error with API key ending in ...${apiKey.slice(-4)}: ${error.message}`);
      
      // Periksa apakah ini galat batas penggunaan
      const isRateLimitError = error.message && error.message.includes('429');

      if (isRateLimitError) {
        // Jika ini adalah kunci terakhir yang dicoba dan masih gagal, kirim galat batas penggunaan ke klien.
        if (i === totalKeys - 1) {
          console.error("All API keys are rate-limited.");
          return res.status(429).json({ error: 'All API keys are currently rate-limited. Please wait a moment.' });
        }
        // Jika tidak, loop akan berlanjut untuk mencoba kunci berikutnya.
      } else {
        // Untuk galat lain (misalnya, argumen tidak valid, galat server), langsung gagal.
        const detailedError = error.message || "An unknown error occurred";
        return res.status(500).json({ error: `Failed to generate content: ${detailedError}` });
      }
    }
  }
}
