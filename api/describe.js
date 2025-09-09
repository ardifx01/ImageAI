
import { GoogleGenAI } from "@google/genai";

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
    console.error("[Describe] Tidak ada kunci API yang dikonfigurasi di server.");
    return res.status(500).json({ error: 'API key not configured on the server. Please set API_KEY or API_KEYS_POOL environment variables.' });
  }

  const { imagePart } = req.body;

  if (!imagePart) {
    return res.status(400).json({ error: 'Missing required field: imagePart' });
  }

  const totalKeys = apiKeys.length;
  for (let i = 0; i < totalKeys; i++) {
    const apiKey = getNextApiKey();
    if (!apiKey) continue;

    console.log(`[Describe] Mencoba permintaan dengan kunci API yang berakhiran ...${apiKey.slice(-4)} (Percobaan ${i + 1}/${totalKeys})`);

    try {
      const describePrompt = "Act as a professional photographer. Describe this image in vivid detail, focusing on the main subject, setting, lighting, composition, colors, and overall mood. The description should be suitable to be used as a prompt to recreate a similar image with an AI image generator.";
      
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: { parts: [imagePart, { text: describePrompt }] },
      });

      const description = response.text;
      if (description) {
        console.log(`[Describe] Berhasil dengan kunci ...${apiKey.slice(-4)}`);
        return res.status(200).json({ description });
      } else {
        console.warn(`[Describe] Gagal mendapatkan deskripsi dengan kunci ...${apiKey.slice(-4)}. Respons kosong.`);
        // Jangan langsung gagal, coba kunci berikutnya
        throw new Error("Empty response from API.");
      }

    } catch (error) {
      const errorMessage = error.message?.toLowerCase() || '';
      const isRateLimitError = errorMessage.includes('429') || errorMessage.includes('resource has been exhausted');
      const isInvalidApiKeyError = errorMessage.includes('api key not valid') || errorMessage.includes('permission denied');
      const isGoogleServerError = errorMessage.includes('500') || errorMessage.includes('503') || errorMessage.includes('service unavailable');

      if (isRateLimitError || isInvalidApiKeyError || isGoogleServerError) {
          let reason = 'a server error';
          if (isRateLimitError) reason = 'rate-limited';
          if (isInvalidApiKeyError) reason = 'invalid or has permission issues';

          console.warn(`[Describe] Kunci ...${apiKey.slice(-4)} gagal karena ${reason}. Mencoba kunci berikutnya...`);

          if (i === totalKeys - 1) { // Jika ini kunci terakhir
              console.error("[Describe] SEMUA KUNCI habis. Mengirim galat 429 ke klien.");
              return res.status(429).json({ error: 'All API keys are currently busy or invalid. Please wait a moment.' });
          }
          continue; // Lanjutkan ke iterasi berikutnya
      } else {
          // Galat yang tidak dapat dicoba ulang
          console.error(`[Describe] Galat tak terduga (tidak dapat dicoba ulang) dengan kunci ...${apiKey.slice(-4)}:`, error);
          return res.status(500).json({ error: `Failed to generate description: ${error.message}` });
      }
    }
  }
}
