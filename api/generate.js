
import { GoogleGenAI, Modality } from "@google/genai";

// Menonaktifkan peringatan eksperimental jika perlu, meskipun lebih baik untuk menanganinya dengan benar
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

/**
 * Memilih kunci API dari pool atau kembali ke kunci tunggal.
 * @returns {string|null} Kunci API yang dipilih atau null jika tidak ada yang dikonfigurasi.
 */
function getApiKey() {
  const apiKeysPool = process.env.API_KEYS_POOL;
  const singleApiKey = process.env.API_KEY;

  if (apiKeysPool) {
    const keys = apiKeysPool.split(',').map(k => k.trim()).filter(Boolean);
    if (keys.length > 0) {
      // Pilih kunci acak dari pool
      return keys[Math.floor(Math.random() * keys.length)];
    }
  }

  return singleApiKey || null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { prompt, imageParts } = req.body;

  if (!prompt || !imageParts || !Array.isArray(imageParts) || imageParts.length === 0) {
    return res.status(400).json({ error: 'Missing required fields: prompt and imageParts' });
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured on the server. Please set API_KEY or API_KEYS_POOL environment variables.' });
  }

  try {
    // --- Logika Pemilihan Model Dinamis ---
    const isMultiImageRequest = imageParts.length > 1;
    let modelName;
    let modelConfig;

    if (isMultiImageRequest) {
      // Gunakan model yang lebih serbaguna untuk permintaan multi-gambar
      modelName = 'gemini-2.5-flash';
      // Model ini tidak memerlukan 'responseModalities'
      modelConfig = {}; 
    } else {
      // Gunakan model yang dioptimalkan untuk pengeditan satu gambar
      modelName = 'gemini-2.5-flash-image-preview';
      modelConfig = {
        responseModalities: [Modality.IMAGE, Modality.TEXT],
      };
    }
    // ------------------------------------

    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: modelName,
      contents: { parts: [...imageParts, { text: prompt }] },
      config: modelConfig,
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

    // Cari bagian gambar dalam respons
    for (const part of candidate.content?.parts || []) {
      if (part.inlineData && part.inlineData.data) {
        imageData = {
          base64: part.inlineData.data,
          mimeType: part.inlineData.mimeType,
        };
        break; // Ditemukan gambar, hentikan perulangan
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
