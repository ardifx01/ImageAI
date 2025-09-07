import React, { useState, useCallback, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI, Modality, Part } from "@google/genai";

// --- Inisialisasi Klien GenAI ---
// Asumsikan process.env.API_KEY tersedia di lingkungan build sisi klien
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });

// --- Fungsi Bantuan ---

/**
 * Mengonversi file menjadi string base64.
 * @param file File yang akan dikonversi.
 * @returns Promise yang diselesaikan dengan string base64.
 */
const fileToGenerativePart = async (file: File): Promise<Part> => {
  const base64EncodedDataPromise = new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
    reader.readAsDataURL(file);
  });
  return {
    inlineData: { data: await base64EncodedDataPromise, mimeType: file.type },
  };
};

// Objek untuk mendefinisikan rasio aspek standar dan nilai desimalnya
const standardRatios: { [key: string]: number } = {
  '1:1': 1,
  '16:9': 16 / 9,
  '9:16': 9 / 16,
  '4:3': 4 / 3,
  '3:4': 3 / 4,
};

/**
 * Menemukan rasio aspek standar terdekat dengan dimensi yang diberikan.
 * @param width Lebar gambar.
 * @param height Tinggi gambar.
 * @returns String yang mewakili rasio aspek standar terdekat (misalnya, "16:9").
 */
const getClosestAspectRatio = (width: number, height: number): string => {
  if (height === 0) return '1:1'; // Hindari pembagian dengan nol
  const imageRatio = width / height;

  let closestRatio = '';
  let minDifference = Infinity;

  for (const ratioKey in standardRatios) {
    const difference = Math.abs(imageRatio - standardRatios[ratioKey]);
    if (difference < minDifference) {
      minDifference = difference;
      closestRatio = ratioKey;
    }
  }
  return closestRatio;
};

/**
 * Menghasilkan nama file yang diformat untuk unduhan.
 * @param type 'original' atau 'generated'.
 * @param styleName Gaya saat ini (digunakan untuk 'generated').
 * @param originalFileName Nama file asli (untuk mendapatkan ekstensi untuk 'original').
 * @param counter Jumlah unduhan saat ini untuk sesi tersebut.
 * @returns String nama file yang diformat.
 */
const generateFilename = (type: 'original' | 'generated', styleName: string, originalFileName: string, counter: number): string => {
    const today = new Date();
    const day = String(today.getDate()).padStart(2, '0');
    const month = String(today.getMonth() + 1).padStart(2, '0'); // Bulan berbasis 0
    const year = today.getFullYear();
    const dateStr = `${day}${month}${year}`;

    const sequence = String(counter).padStart(2, '0');

    if (type === 'original') {
        const extension = originalFileName.split('.').pop() || 'png';
        return `original_${dateStr}_${sequence}.${extension}`;
    } else {
        const sanitizedStyle = styleName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
        const finalStyle = sanitizedStyle || 'generated'; // Fallback jika gaya adalah 'Default' atau kosong
        return `style_${finalStyle}_${dateStr}_${sequence}.png`;
    }
};


// --- Komponen Ikon SVG ---

const DownloadIcon = () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M19.5 13.5V19.5H4.5V13.5H2.5V19.5C2.5 20.6046 3.39543 21.5 4.5 21.5H19.5C20.6046 21.5 21.5 20.6046 21.5 19.5V13.5H19.5Z" fill="currentColor"/>
        <path d="M12 15.5L16.5 11L15.086 9.58599L13 11.672V2.5H11V11.672L8.91401 9.58599L7.5 11L12 15.5Z" fill="currentColor"/>
    </svg>
);
const UseAsInputIcon = () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M13.25 2.5H11.75V8.5H5.75V10L11.75 10V16H13.25V10H19.25V8.5L13.25 8.5V2.5Z" fill="currentColor"/>
        <path d="M19.5 21.5H5.5C4.39543 21.5 3.5 20.6046 3.5 19.5V13H5.5V19.5H19.5V13H21.5V19.5C21.5 20.6046 20.6046 21.5 19.5 21.5Z" fill="currentColor"/>
    </svg>
);
const CopyIcon = () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M17.5 2.5H9.5C8.39543 2.5 7.5 3.39543 7.5 4.5V12.5H9.5V4.5H17.5V12.5H19.5V4.5C19.5 3.39543 18.6046 2.5 17.5 2.5Z" fill="currentColor"/>
        <path d="M14.5 7.5H6.5C5.39543 7.5 4.5 8.39543 4.5 9.5V19.5C4.5 20.6046 5.39543 21.5 6.5 21.5H14.5C15.6046 21.5 16.5 20.6046 16.5 19.5V9.5C16.5 8.39543 15.6046 7.5 14.5 7.5ZM14.5 19.5H6.5V9.5H14.5V19.5Z" fill="currentColor"/>
    </svg>
);
const DescribeIcon = () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12.5 2.5L14.0625 5.625L17.5 6.25L15 8.75L15.625 12.5L12.5 10.8125L9.375 12.5L10 8.75L7.5 6.25L11.0625 5.625L12.5 2.5ZM12.5 8.1875L13.75 10.8125L11.25 10.8125L12.5 8.1875ZM7.5 13.75L9.375 15L7.5 16.25V13.75ZM17.5 13.75V16.25L15.625 15L17.5 13.75ZM12.5 13.1875L13.75 15.8125L11.25 15.8125L12.5 13.1875ZM2.5 17.5L5.625 15.9375L6.25 19.375L8.75 16.875L12.5 17.5L16.25 16.875L18.75 19.375L19.375 15.9375L22.5 17.5L19.375 19.0625L18.75 22.5L16.25 20L12.5 20.625L8.75 20L6.25 22.5L5.625 19.0625L2.5 17.5Z" fill="currentColor" />
    </svg>
);

// --- Definisi Gaya ---
const styles = [
    { name: 'Default', prompt: '{prompt}', singleUploader: true },
    { name: 'Kartun', prompt: 'Gaya kartun: ilustrasi ceria, garis tebal, warna-warna cerah. {prompt}', singleUploader: true },
    { name: 'Fantasi', prompt: 'Gaya fantasi: pemandangan epik, elemen magis, atmosfer seperti mimpi. {prompt}', singleUploader: true },
    { name: 'Fotorealistik', prompt: 'Gaya fotorealistik: detail tajam, pencahayaan dan tekstur yang disempurnakan. {prompt}', singleUploader: true },
    { name: 'Ganti Latar', prompt: 'Subjek utama dengan latar belakang baru: {prompt}', singleUploader: true, requiresPrompt: true },
    { name: 'Ganti Pakaian', prompt: 'Subjek mengenakan pakaian yang berbeda: {prompt}', singleUploader: true, requiresPrompt: true },
    { name: 'Ganti Rambut', prompt: 'Subjek dengan gaya rambut baru: {prompt}', singleUploader: true, requiresPrompt: true },
    { name: 'Model Aestetik', prompt: 'Gaya model estetis: postur elegan, pencahayaan dramatis, komposisi artistik. {prompt}', singleUploader: true },
    { name: 'Monochrome for Man', prompt: 'Foto monokrom profil samping seorang pria, cahaya menyoroti tepi rambut dan wajah, latar belakang gelap, menonjolkan siluet. {prompt}', singleUploader: true },
    { name: 'Monochrome for woman', prompt: 'Foto monokrom profil samping seorang wanita, cahaya menyoroti tepi rambut dan wajah, latar belakang gelap, menonjolkan siluet. {prompt}', singleUploader: true },
    { name: 'Cinematic candid', prompt: 'Cinematic candid photography with a blend of Matte Film Look preset, Soft Fade Shadows, and subtle grain effect. Featuring a handsome young man like the attached reference photo. He stands cool and relaxed in the golden savanna of Wairinding, Sumba. His body faces slightly sideways, one hand in his pants pocket while the other tosses a traveler tumbler into the air. The tumbler is blurred, spinning above his hand. Outfit: oversized cream linen shirt, loose khaki pants, classic white sneakers, and a sporty watch. He has a high-end Canon camera slung around his neck. The shot is taken from a low angle hidden behind the tall wild savanna grass, with slightly blurred grass in the foreground creating dreamy depth and a natural frame on the side of the frame. The subject and spinning tumbler are in sharp focus, with the background of golden savanna hills and soft blue sky. Warm late-afternoon light gently illuminates the scene, giving pastel tones with faded highlights and softly fading shadows, creating a cinematic, dreamy, and timeless atmosphere. {prompt}', singleUploader: true },
    { name: 'Selfie with Artist', prompt: 'Make it so that I am taking a selfie with {prompt} a backstage concert in America. Make the natural lighting photo', singleUploader: true, requiresPrompt: true },
    { name: 'Campuran Gambar', prompt: 'Perpaduan artistik dari dua gambar. {prompt}', singleUploader: false },
    { name: 'Pakaian dari Gambar', prompt: 'Kenakan pakaian dari gambar kedua pada orang di gambar pertama. Pertahankan pose, wajah, dan latar belakang orang tersebut, tetapi ganti pakaian mereka. {prompt}', singleUploader: false },
];

// --- Komponen Aplikasi Utama ---

const App = () => {
  // Variabel state
  const [prompt, setPrompt] = useState<string>('');
  const [mainImage, setMainImage] = useState<File | null>(null);
  const [styleImage, setStyleImage] = useState<File | null>(null);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [activeStyle, setActiveStyle] = useState<string>('Default');
  const [aspectRatio, setAspectRatio] = useState<string>('1:1');
  const [isAspectRatioLocked, setIsAspectRatioLocked] = useState<boolean>(false);
  const [mainImagePreview, setMainImagePreview] = useState<string | null>(null);
  const [styleImagePreview, setStyleImagePreview] = useState<string | null>(null);
  const [isDescribeLoading, setIsDescribeLoading] = useState<boolean>(false);
  
  // Ref untuk input file
  const mainImageInputRef = useRef<HTMLInputElement>(null);
  const styleImageInputRef = useRef<HTMLInputElement>(null);
  const downloadCounter = useRef(1);

  // --- Handler ---

  const handleFileChange = (
    e: React.ChangeEvent<HTMLInputElement>,
    setImage: React.Dispatch<React.SetStateAction<File | null>>,
    setPreview: React.Dispatch<React.SetStateAction<string | null>>
  ) => {
    const file = e.target.files?.[0];
    if (file) {
      setImage(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreview(reader.result as string);
        if (setImage === setMainImage && !isAspectRatioLocked) {
          const img = new Image();
          img.onload = () => setAspectRatio(getClosestAspectRatio(img.width, img.height));
          img.src = reader.result as string;
        }
      };
      reader.readAsDataURL(file);
    }
    // Hapus nilai input untuk memungkinkan pengunggahan ulang file yang sama
    e.target.value = ''; 
  };
  
  const handleStyleClick = (style: { name: string, prompt: string, singleUploader: boolean, requiresPrompt?: boolean }) => {
    setActiveStyle(style.name);
    // Hanya perbarui prompt jika gaya tidak memerlukan prompt pengguna kustom
    if (!style.requiresPrompt) {
        const newPrompt = style.prompt.includes('{prompt}') ? '' : style.prompt;
        setPrompt(newPrompt);
    } else {
        // Jika memerlukan prompt, kosongkan kotak teks agar pengguna dapat mengetik
        setPrompt('');
    }
  };

  const handleDescribe = async () => {
    if (!mainImage) {
        setError("Silakan unggah gambar terlebih dahulu untuk dideskripsikan.");
        return;
    }
    setIsDescribeLoading(true);
    setError('');
    try {
        const imagePart = await fileToGenerativePart(mainImage);
        const describePrompt = "Bertindak sebagai fotografer profesional. Jelaskan gambar ini dengan detail yang jelas, berfokus pada subjek utama, latar, pencahayaan, komposisi, warna, dan suasana keseluruhan. Deskripsi harus cocok untuk digunakan sebagai prompt untuk membuat ulang gambar serupa dengan generator gambar AI.";
        
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: { parts: [imagePart, { text: describePrompt }] },
        });

        const description = response.text;
        if (description) {
          setPrompt(description);
        } else {
          setError("AI tidak dapat menghasilkan deskripsi untuk gambar ini.");
        }
    } catch (e: any) {
        console.error('Error in handleDescribe:', e);
        setError(`Deskripsi gagal: ${e.message}`);
    } finally {
        setIsDescribeLoading(false);
    }
  };
  
  const generateImage = async () => {
    const currentStyle = styles.find(s => s.name === activeStyle) || styles[0];
    const isSingleUploader = currentStyle.singleUploader;

    // Validasi
    const isPromptRequired = currentStyle.requiresPrompt || currentStyle.prompt.trim() === '{prompt}';

    if (!prompt && isPromptRequired) {
        if (currentStyle.requiresPrompt) {
            setError(`Silakan jelaskan apa yang ingin Anda ubah. Contoh untuk "${currentStyle.name}": "kemeja biru" atau "pantai saat senja".`);
        } else {
            setError('Silakan masukkan prompt untuk memandu AI.');
        }
        return;
    }
    if (isSingleUploader && !mainImage) {
        setError('Silakan unggah gambar utama.');
        return;
    }
    if (!isSingleUploader && (!mainImage || !styleImage)) {
        setError('Silakan unggah gambar utama dan gambar gaya untuk mode ini.');
        return;
    }

    setIsLoading(true);
    setGeneratedImage(null);
    setError('');

    try {
        // Buat prompt akhir
        const finalPrompt = currentStyle.prompt.replace('{prompt}', prompt);

        // Siapkan bagian gambar
        const imageParts: Part[] = [];
        if (mainImage) imageParts.push(await fileToGenerativePart(mainImage));
        if (!isSingleUploader && styleImage) imageParts.push(await fileToGenerativePart(styleImage));

        // Panggilan API Langsung
        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash-image-preview',
          contents: { parts: [...imageParts, { text: finalPrompt }] },
          config: {
            responseModalities: [Modality.IMAGE, Modality.TEXT],
          },
        });
        
        const candidate = response.candidates?.[0];

        if (!candidate) {
          throw new Error("Tidak ada respons dari API. Permintaan mungkin telah diblokir.");
        }
    
        if (candidate.finishReason === 'SAFETY') {
          throw new Error("Pembuatan gambar gagal. Prompt atau gambar mungkin melanggar kebijakan keamanan. Harap sesuaikan input Anda dan coba lagi.");
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
            setGeneratedImage(`data:${imageData.mimeType};base64,${imageData.base64}`);
        } else {
          const errorMessage = responseText 
            ? `API mengembalikan teks alih-alih gambar: "${responseText.trim()}"`
            : "API tidak mengembalikan gambar. Mungkin telah diblokir karena pengaturan keamanan atau masalah prompt.";
          throw new Error(errorMessage);
        }

    } catch (e: any) {
        console.error('Error in generateImage:', e);
        setError(`Pembuatan gagal: ${e.message}`);
        setGeneratedImage(null);
    } finally {
        setIsLoading(false);
    }
  };

  const handleDownload = (imageUrl: string | null, type: 'original' | 'generated') => {
      if (!imageUrl) return;

      const originalFileName = mainImage?.name || 'image.png';
      const filename = generateFilename(type, activeStyle, originalFileName, downloadCounter.current);
      
      const link = document.createElement('a');
      link.href = imageUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      downloadCounter.current += 1;
  };

  const handleUseAsInput = () => {
      if (!generatedImage) return;

      fetch(generatedImage)
          .then(res => res.blob())
          .then(blob => {
              const file = new File([blob], 'generated_image.png', { type: 'image/png' });
              setMainImage(file);
              setMainImagePreview(generatedImage);
              // Opsional: reset bidang lain
              setGeneratedImage(null);
          });
  };

  const copyPromptToClipboard = useCallback(() => {
    if (prompt) {
        navigator.clipboard.writeText(prompt);
    }
  }, [prompt]);

  const currentStyle = styles.find(s => s.name === activeStyle) || styles[0];
  const isBlendMode = !currentStyle.singleUploader;

  // Label dinamis untuk mode dua pengunggah
  let mainUploaderLabel = 'Gambar Utama';
  let styleUploaderLabel = 'Gambar Gaya';
  let blendHelperText = 'Pilih gambar utama dan gambar gaya untuk memadukannya.';

  if (activeStyle === 'Pakaian dari Gambar') {
    mainUploaderLabel = 'Orang';
    styleUploaderLabel = 'Pakaian';
    blendHelperText = 'Unggah foto orang dan gambar pakaian yang ingin Anda kenakan.';
  }

  return (
    <>
        <header className="navbar">
            <div className="navbar-container">
                <h1>AI Image Transformer</h1>
            </div>
        </header>

        <main className="main-content">
            <section className="hero">
                <h2>Ubah Ide Anda menjadi Realitas Visual</h2>
            </section>
            
            <div className="app-container">
                <aside className="controls-panel panel">
                <h2>Kontrol</h2>

                {/* --- Bagian Unggah Gambar --- */}
                <div className="control-section">
                    <h3>{isBlendMode ? 'Unggah Gambar' : 'Unggah Gambar'}</h3>
                    {isBlendMode ? (
                        <div className="blend-uploader-container">
                             <p className="helper-text">{blendHelperText}</p>
                             <div className="blend-inputs">
                                <div className="upload-box" onClick={() => mainImageInputRef.current?.click()}>
                                    <div className="upload-box-content">
                                        {mainImagePreview ? <img src={mainImagePreview} alt="Pratinjau Utama" className="upload-box-thumbnail"/> : <span className="upload-box-plus">+</span>}
                                    </div>
                                    <p className="upload-box-label">{mainUploaderLabel}</p>
                                    <input ref={mainImageInputRef} type="file" accept="image/*" onChange={(e) => handleFileChange(e, setMainImage, setMainImagePreview)} style={{ display: 'none' }} />
                                </div>
                                <div className="upload-box" onClick={() => styleImageInputRef.current?.click()}>
                                    <div className="upload-box-content">
                                        {styleImagePreview ? <img src={styleImagePreview} alt="Pratinjau Gaya" className="upload-box-thumbnail"/> : <span className="upload-box-plus">+</span>}
                                    </div>
                                    <p className="upload-box-label">{styleUploaderLabel}</p>
                                    <input ref={styleImageInputRef} type="file" accept="image/*" onChange={(e) => handleFileChange(e, setStyleImage, setStyleImagePreview)} style={{ display: 'none' }} />
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="single-uploader-container">
                            <div className="upload-main-container">
                                {mainImagePreview && <img id="main-image-thumbnail" src={mainImagePreview} alt="Pratinjau utama" />}
                                <button className="upload-btn" onClick={() => mainImageInputRef.current?.click()}>
                                    {mainImage ? 'Ubah Gambar' : 'Pilih Gambar'}
                                </button>
                                <input ref={mainImageInputRef} type="file" accept="image/*" onChange={(e) => handleFileChange(e, setMainImage, setMainImagePreview)} style={{ display: 'none' }} />
                            </div>
                        </div>
                    )}
                </div>

                {/* --- Pilihan Gaya --- */}
                <div className="control-section">
                    <h3>Gaya</h3>
                    <div className="style-selector">
                    {styles.map(style => (
                        <button
                        key={style.name}
                        className={`style-button ${activeStyle === style.name ? 'active' : ''}`}
                        onClick={() => handleStyleClick(style)}
                        >
                        {style.name}
                        </button>
                    ))}
                    </div>
                </div>

                {/* --- Input Prompt --- */}
                <div className="control-section">
                    <h3>Prompt</h3>
                    <div className="prompt-container">
                    <textarea
                        id="prompt-input"
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        placeholder={
                            currentStyle.requiresPrompt 
                                ? `misalnya, kota cyberpunk futuristik` 
                                : `Jelaskan visi Anda...`
                        }
                        rows={4}
                    />
                     <button 
                        className="ai-describe-button" 
                        onClick={handleDescribe}
                        disabled={isDescribeLoading || !mainImage}
                        aria-label="Hasilkan deskripsi dari gambar"
                     >
                        {isDescribeLoading ? <span className="spinner-small"></span> : <DescribeIcon />}
                        Deskripsi AI
                    </button>
                    </div>
                </div>

                {/* --- Opsi --- */}
                <div className="control-section">
                     <h3>Opsi</h3>
                     <div className="options-container">
                        <div className="option-item">
                            <label htmlFor="aspect-ratio">Rasio Aspek</label>
                            <select 
                                id="aspect-ratio" 
                                className="aspect-ratio-select"
                                value={aspectRatio} 
                                onChange={(e) => setAspectRatio(e.target.value)}
                                disabled={isAspectRatioLocked}
                            >
                                <option value="1:1">1:1 (Persegi)</option>
                                <option value="16:9">16:9 (Layar Lebar)</option>
                                <option value="9:16">9:16 (Vertikal)</option>
                                <option value="4:3">4:3 (Standar)</option>
                                <option value="3:4">3:4 (Potret)</option>
                            </select>
                        </div>
                        <div className="checkbox-group">
                            <div className="checkbox-container">
                                <input 
                                    type="checkbox" 
                                    id="lock-aspect-ratio" 
                                    checked={isAspectRatioLocked}
                                    onChange={(e) => setIsAspectRatioLocked(e.target.checked)}
                                />
                                <label htmlFor="lock-aspect-ratio">Kunci Rasio Aspek</label>
                            </div>
                        </div>
                     </div>
                </div>

                <button
                    className="transform-button"
                    onClick={generateImage}
                    disabled={isLoading}
                >
                    {isLoading ? 'Mengubah...' : 'Ubah'}
                </button>

                {error && <p className="error-message">{error}</p>}
                </aside>
                
                <div className="image-panel">
                <div className="panel" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                    <h3>Gambar yang Dihasilkan</h3>
                    <div className="image-placeholder">
                    {isLoading && (
                        <div className="loading-overlay">
                            <div className="spinner"></div>
                            <p>AI sedang berpikir...</p>
                        </div>
                    )}
                    {generatedImage ? (
                        <>
                            <img src={generatedImage} alt="Dihasilkan" />
                            <div className="image-toolbar">
                                <button className="toolbar-button" onClick={() => handleDownload(generatedImage, 'generated')} aria-label="Unduh gambar yang dihasilkan">
                                    <DownloadIcon />
                                </button>
                                <div className="toolbar-divider"></div>
                                <button className="toolbar-button" onClick={handleUseAsInput} aria-label="Gunakan sebagai input">
                                    <UseAsInputIcon />
                                </button>
                                <div className="toolbar-divider"></div>
                                 <button className="toolbar-button" onClick={copyPromptToClipboard} aria-label="Salin prompt">
                                    <CopyIcon />
                                </button>
                            </div>
                        </>
                    ) : (
                        <div className="upload-prompt">
                            <p>Gambar yang Anda hasilkan akan muncul di sini.</p>
                        </div>
                    )}
                    </div>
                </div>
                {mainImagePreview && (
                    <div className="panel" style={{ marginTop: '20px' }}>
                        <h3>Gambar Asli</h3>
                        <div className="image-placeholder">
                            <img src={mainImagePreview} alt="Asli" />
                             <div className="image-toolbar-single">
                                <button className="toolbar-button" onClick={() => handleDownload(mainImagePreview, 'original')} aria-label="Unduh gambar asli">
                                    <DownloadIcon />
                                </button>
                            </div>
                        </div>
                    </div>
                )}
                </div>
            </div>
        </main>
        <footer className="footer">
            <p>Didukung oleh Gemini AI. Dibuat oleh IT PALUGADA.</p>
        </footer>
    </>
  );
};

const container = document.getElementById('root');
const root = createRoot(container!);
root.render(<App />);