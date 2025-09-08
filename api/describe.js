
import { GoogleGenAI } from "@google/genai";

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

  const { imagePart } = req.body;

  if (!imagePart) {
    return res.status(400).json({ error: 'Missing required field: imagePart' });
  }

  // Loop coba ulang: coba setiap kunci sekali
  const totalKeys = apiKeys.length;
  for (let i = 0; i < totalKeys; i++) {
    const apiKey = getNextApiKey();
    if (!apiKey) continue;

    try {
      const describePrompt = "Act as a professional photographer. Describe this image in vivid detail, focusing on the main subject, setting, lighting, composition, colors, and overall mood. The description should be suitable to be used as a prompt to recreate a similar image with an AI image generator.";
      
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: { parts: [imagePart, { text: describePrompt }] },
      });

      const description = response.text;
      if (description) {
        // Berhasil! Kirim respons dan hentikan loop.
        return res.status(200).json({ description });
      } else {
        // Ini adalah galat non-coba-ulang, jadi langsung hentikan.
        return res.status(500).json({ error: "AI couldn't generate a description for this image." });
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
        // Untuk galat lain, langsung gagal.
        return res.status(500).json({ error: `Failed to generate description: ${error.message}` });
      }
    }
  }
}
