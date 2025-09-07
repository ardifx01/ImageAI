import React, { useState, useCallback, useMemo } from 'react';
import { createRoot } from 'react-dom/client';

// --- SVG Icons ---
const SparklesIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3a6 6 0 0 0 9 9a9 9 0 1 1-9-9Z"/></svg>
);
const DownloadIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
);
const UseAsSourceIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/><path d="m12 13.5-2.5-2.5"/><path d="m14.5 11-5 5"/></svg>
);
const SuperRealisticIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5.5V3M6.7 6.7l-1.2-1.2M3 12.5H1M6.7 18.3l-1.2 1.2M12 22.5V20M17.3 18.3l1.2 1.2M22 12.5H20M17.3 6.7l1.2-1.2"/><circle cx="12" cy="12.5" r="4"/><path d="M12 12.5a4.5 4.5 0 0 0-4.5 4.5 4.5 4.5 0 0 0 9 0 4.5 4.5 0 0 0-4.5-4.5Z"/></svg>
);

const App = () => {
  // --- State Management ---
  const [sourceImage, setSourceImage] = useState<{ url: string; part: any; file: File } | null>(null);
  const [styleImage, setStyleImage] = useState<{ url: string; part: any; file: File } | null>(null);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [prompt, setPrompt] = useState('');
  const [activeStyle, setActiveStyle] = useState('Variasi');
  const [aspectRatio, setAspectRatio] = useState('1:1');
  const [isSuperRealistic, setIsSuperRealistic] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  
  const STYLES = [
    { id: 'Variasi', label: 'Variasi' },
    { id: 'Ganti Baju', label: 'Ganti Baju' },
    { id: 'Fantasi', label: 'Fantasi' },
    { id: 'Kartun', label: 'Kartun' },
  ];

  // --- Image Processing ---
  const resizeImage = (file: File, maxSize = 1024): Promise<File> => {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.src = URL.createObjectURL(file);
        image.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            if (!ctx) return reject(new Error('Could not get canvas context'));

            let { width, height } = image;
            if (width > height) {
                if (width > maxSize) {
                    height *= maxSize / width;
                    width = maxSize;
                }
            } else {
                if (height > maxSize) {
                    width *= maxSize / height;
                    height = maxSize;
                }
            }
            canvas.width = width;
            canvas.height = height;

            ctx.drawImage(image, 0, 0, width, height);

            canvas.toBlob((blob) => {
                if (!blob) return reject(new Error('Canvas to Blob failed.'));
                const resizedFile = new File([blob], file.name, {
                    type: file.type,
                    lastModified: Date.now(),
                });
                resolve(resizedFile);
            }, file.type, 0.9); // 0.9 is quality
        };
        image.onerror = reject;
    });
  };

  const fileToGenerativePart = async (file: File) => {
    const base64EncodedDataPromise = new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
      reader.readAsDataURL(file);
    });
    return { inlineData: { data: await base64EncodedDataPromise, mimeType: file.type } };
  };

  const handleImageUpload = useCallback(async (
    event: React.ChangeEvent<HTMLInputElement>,
    imageSetter: React.Dispatch<React.SetStateAction<{ url: string; part: any; file: File } | null>>
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    try {
        const resizedFile = await resizeImage(file);
        const part = await fileToGenerativePart(resizedFile);
        const url = URL.createObjectURL(resizedFile);
        imageSetter({ url, part, file: resizedFile });
        if (imageSetter === setSourceImage) {
            setGeneratedImage(null);
            setError(null);
        }
    } catch(e) {
        console.error(e);
        setError("Gagal memproses gambar. Silakan coba file lain.");
    }
  }, []);

  // --- API Calls ---
  const handleDescribe = useCallback(async () => {
    if (!sourceImage) {
      setError('Silakan unggah gambar utama terlebih dahulu.');
      return;
    }

    setIsLoading(true);
    setLoadingMessage('Menganalisis gambar...');
    setError(null);

    try {
      const response = await fetch('/api/describe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imagePart: sourceImage.part }),
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Gagal mendapatkan deskripsi.');
      
      setPrompt(result.description);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsLoading(false);
    }
  }, [sourceImage]);

  const handleGenerate = useCallback(async () => {
    setError(null);
    setGeneratedImage(null);
    setIsLoading(true);
    setLoadingMessage('Membuat keajaiban...');

    let finalPrompt = prompt;
    const imageParts = [];
    
    if (sourceImage) {
        imageParts.push(sourceImage.part);
    }

    // --- Logic for different styles ---
    if (activeStyle === 'Ganti Baju') {
      if (!sourceImage || !styleImage) {
        setError('Untuk "Ganti Baju", Anda harus mengunggah gambar orang dan gambar outfit baru.');
        setIsLoading(false);
        return;
      }
      imageParts.push(styleImage.part);
      finalPrompt = "PENTING: Ganti seluruh pakaian pada orang di gambar pertama dengan seluruh pakaian dari gambar kedua. Pertahankan wajah, tubuh, dan latar belakang orang dari gambar pertama. Jangan gabungkan kedua gambar atau orangnya.";
    } else if (activeStyle === 'Fantasi') {
        finalPrompt = `Ubah gambar menjadi sebuah adegan fantasi epik. ${prompt}`;
    } else if (activeStyle === 'Kartun') {
        finalPrompt = `Ubah gambar ini menjadi gaya kartun yang cerah dan berwarna. ${prompt}`;
    }
    
    if (isSuperRealistic) {
        finalPrompt += ". Buat gambar ini super realistis, detail tinggi, kualitas 8k, sinematik.";
    }

    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: finalPrompt, imageParts }),
      });
      const result = await response.json();

      if (!response.ok) throw new Error(result.error || 'Gagal menghasilkan gambar.');

      setGeneratedImage(`data:${result.mimeType};base64,${result.base64}`);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsLoading(false);
    }
  }, [sourceImage, styleImage, prompt, activeStyle, isSuperRealistic]);

  const isGenerateDisabled = useMemo(() => {
    if (isLoading) return true;
    if (!sourceImage) return true;
    if (activeStyle === 'Ganti Baju' && !styleImage) return true;
    if (!prompt && activeStyle !== 'Ganti Baju') return true;
    return false;
  }, [isLoading, sourceImage, styleImage, activeStyle, prompt]);

  // --- Component Rendering ---
  return (
    <>
      <nav className="navbar">
        <div className="navbar-container">
          <h1>ImageAI Generator</h1>
        </div>
      </nav>
      <main className="main-content">
        <div className="app-container">
          <aside className="controls-panel panel">
            <h2>Kontrol</h2>
            
            <section className="control-section">
              <h3>1. Unggah Gambar Utama</h3>
              <div className="upload-main-container">
                {sourceImage && (
                    <img id="main-image-thumbnail" src={sourceImage.url} alt="Pratinjau Gambar Utama" />
                )}
                <label className="upload-btn">
                  <span>{sourceImage ? 'Ganti Gambar' : 'Pilih Gambar'}</span>
                  <input type="file" accept="image/*" onChange={(e) => handleImageUpload(e, setSourceImage)} style={{ display: 'none' }} />
                </label>
              </div>
            </section>

            <section className="control-section">
              <h3>2. Pilih Gaya</h3>
              <div className="style-selector">
                {STYLES.map(({id, label}) => (
                  <button key={id} className={`style-button ${activeStyle === id ? 'active' : ''}`} onClick={() => setActiveStyle(id)}>
                    {label}
                  </button>
                ))}
              </div>
            </section>

            {activeStyle === 'Ganti Baju' && (
              <section className="control-section">
                <div className="blend-uploader-container">
                    <p className="helper-text">Unggah gambar orang di kiri & outfit baru di kanan.</p>
                    <div className="blend-inputs">
                        <div className={`upload-box ${!sourceImage ? 'disabled' : ''}`}>
                            <label>
                                <span className="upload-box-label">Orang</span>
                                <div className="upload-box-content">
                                    {sourceImage ? <img src={sourceImage.url} alt="Orang" className="upload-box-thumbnail" /> : <span className="upload-box-plus">+</span>}
                                </div>
                                <input type="file" accept="image/*" disabled={!sourceImage} onChange={(e) => handleImageUpload(e, setSourceImage)} />
                            </label>
                        </div>
                        <div className={`upload-box ${!sourceImage ? 'disabled' : ''}`}>
                             <label>
                                <span className="upload-box-label">Outfit Baru</span>
                                <div className="upload-box-content">
                                    {styleImage ? <img src={styleImage.url} alt="Outfit" className="upload-box-thumbnail" /> : <span className="upload-box-plus">+</span>}
                                </div>
                                <input type="file" accept="image/*" disabled={!sourceImage} onChange={(e) => handleImageUpload(e, setStyleImage)} />
                            </label>
                        </div>
                    </div>
                </div>
              </section>
            )}

            <section className="control-section">
              <h3>3. Deskripsi (Prompt)</h3>
              <div className="prompt-container">
                <textarea
                  id="prompt-input"
                  rows={5}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Deskripsikan gambar atau perubahan yang Anda inginkan..."
                  disabled={activeStyle === 'Ganti Baju'}
                />
                <button className="ai-describe-button" onClick={handleDescribe} disabled={!sourceImage || isLoading}>
                  <SparklesIcon />
                  Deskripsikan dengan AI
                </button>
              </div>
            </section>
            
            <section className="control-section">
              <h3>4. Opsi</h3>
              <div className="options-container">
                <div className="option-item">
                    <label htmlFor="aspect-ratio">Aspek Rasio</label>
                    <select id="aspect-ratio" className="aspect-ratio-select" value={aspectRatio} onChange={e => setAspectRatio(e.target.value)}>
                        <option value="1:1">Persegi (1:1)</option>
                        <option value="16:9">Lanskap (16:9)</option>
                        <option value="9:16">Potret (9:16)</option>
                    </select>
                </div>
                 <div className="checkbox-container">
                    <input type="checkbox" id="super-realistic" checked={isSuperRealistic} onChange={(e) => setIsSuperRealistic(e.target.checked)} />
                    <label htmlFor="super-realistic">
                      <SuperRealisticIcon/> Super Realistis
                    </label>
                </div>
              </div>
            </section>
            
            <button className="transform-button" onClick={handleGenerate} disabled={isGenerateDisabled}>
              {isLoading ? loadingMessage : 'Transformasi'}
            </button>
            {error && <p className="error-message">{error}</p>}
          </aside>
          
          <main className="image-panel panel">
            <h3>Hasil Gambar</h3>
            <div className="image-placeholder">
                {isLoading && (
                    <div className="loading-overlay">
                        <div className="spinner"></div>
                        <p>{loadingMessage}</p>
                    </div>
                )}
                {generatedImage ? (
                    <div className="generated-image-container">
                        <img src={generatedImage} alt="Gambar yang Dihasilkan" />
                        <div className="image-toolbar">
                             <button className="toolbar-button" title="Unduh" onClick={() => {
                                const a = document.createElement('a');
                                a.href = generatedImage;
                                a.download = 'generated-image.png';
                                a.click();
                             }}>
                                <DownloadIcon />
                            </button>
                            <div className="toolbar-divider"></div>
                            <button className="toolbar-button" title="Gunakan sebagai Sumber" onClick={async () => {
                                const res = await fetch(generatedImage);
                                const blob = await res.blob();
                                const file = new File([blob], "generated-image.png", { type: "image/png" });
                                const part = await fileToGenerativePart(file);
                                setSourceImage({url: generatedImage, part, file});
                            }}>
                                <UseAsSourceIcon />
                            </button>
                        </div>
                    </div>
                ) : (
                    !isLoading && <div className="upload-prompt"><p>Gambar hasil transformasi Anda akan muncul di sini.</p></div>
                )}
            </div>
          </main>
        </div>
      </main>
      <footer className="footer">
        <p>Dibuat dengan Gemini API</p>
      </footer>
    </>
  );
};

const container = document.getElementById('root');
const root = createRoot(container!);
root.render(<App />);
