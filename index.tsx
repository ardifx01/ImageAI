
import React, { useState, useCallback, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI, Modality, Part } from "@google/genai";

// --- Helper Functions ---

/**
 * Converts a file to a base64 string.
 * @param file The file to convert.
 * @returns A promise that resolves with the base64 string.
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

/**
 * Calculates the aspect ratio of an image.
 * @param width The width of the image.
 * @param height The height of the image.
 * @returns A string representing the aspect ratio (e.g., "16:9").
 */
const getAspectRatio = (width: number, height: number): string => {
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const divisor = gcd(width, height);
  return `${width / divisor}:${height / divisor}`;
};

/**
 * Generates a formatted filename for downloads.
 * @param type 'original' or 'generated'.
 * @param styleName The current style (used for 'generated').
 * @param originalFileName The original filename (to get extension for 'original').
 * @param counter The current download count for the session.
 * @returns A formatted filename string.
 */
const generateFilename = (type: 'original' | 'generated', styleName: string, originalFileName: string, counter: number): string => {
    const today = new Date();
    const day = String(today.getDate()).padStart(2, '0');
    const month = String(today.getMonth() + 1).padStart(2, '0'); // Month is 0-indexed
    const year = today.getFullYear();
    const dateStr = `${day}${month}${year}`;

    const sequence = String(counter).padStart(2, '0');

    if (type === 'original') {
        const extension = originalFileName.split('.').pop() || 'png';
        return `original_${dateStr}_${sequence}.${extension}`;
    } else {
        const sanitizedStyle = styleName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
        const finalStyle = sanitizedStyle || 'generated'; // Fallback if style is 'Default' or empty
        return `style_${finalStyle}_${dateStr}_${sequence}.png`;
    }
};


// --- SVG Icon Components ---

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

// --- Style Definitions ---
const styles = [
    { name: 'Default', prompt: '{prompt}', singleUploader: true },
    { name: 'Kartun', prompt: 'Ubah gambar menjadi ilustrasi kartun yang ceria dengan garis-garis tebal dan warna-warna cerah. {prompt}', singleUploader: true },
    { name: 'Fantasi', prompt: 'Ubah gambar menjadi pemandangan fantasi epik, dengan elemen magis dan atmosfer seperti mimpi. {prompt}', singleUploader: true },
    { name: 'Fotorealistik', prompt: 'Tingkatkan gambar menjadi fotorealistik, pertajam detail, pencahayaan, dan tekstur. {prompt}', singleUploader: true },
    { name: 'Ganti Latar', prompt: 'Ganti latar belakang gambar dengan {prompt}, jaga agar subjek utama tetap utuh.', singleUploader: true },
    { name: 'Ganti Pakaian', prompt: 'Ganti seluruh pakaian subjek dengan {prompt}, pertahankan wajah dan latar belakangnya.', singleUploader: true, requiresPrompt: true },
    { name: 'Ganti Rambut', prompt: 'Ganti gaya rambut subjek menjadi {prompt}, pertahankan fitur wajah dan pakaian lainnya.', singleUploader: true, requiresPrompt: true },
    { name: 'Campuran Gambar', prompt: 'Campurkan gambar utama dengan gambar gaya. {prompt}', singleUploader: false },
];

// --- API Abstraction ---
const callApi = async (endpoint: string, body: object) => {
    const response = await fetch(`/api/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to parse error response' }));
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
    }

    return response.json();
};

// --- Main App Component ---

const App = () => {
  // State variables
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
  
  // Refs for file inputs
  const mainImageInputRef = useRef<HTMLInputElement>(null);
  const styleImageInputRef = useRef<HTMLInputElement>(null);
  const downloadCounter = useRef(1);

  // --- Handlers ---

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
          img.onload = () => setAspectRatio(getAspectRatio(img.width, img.height));
          img.src = reader.result as string;
        }
      };
      reader.readAsDataURL(file);
    }
    // Clear the input value to allow re-uploading the same file
    e.target.value = ''; 
  };
  
  // FIX: Added 'requiresPrompt' to the style object type to fix the TypeScript error.
  const handleStyleClick = (style: { name: string, prompt: string, singleUploader: boolean, requiresPrompt?: boolean }) => {
    setActiveStyle(style.name);
    // Only update prompt if the style doesn't require a custom user prompt
    if (!style.requiresPrompt) {
        const newPrompt = style.prompt.includes('{prompt}') ? '' : style.prompt;
        setPrompt(newPrompt);
    } else {
        // If it requires a prompt, clear the text box for the user to type
        setPrompt('');
    }
  };

  const handleDescribe = async () => {
    if (!mainImage) {
        setError("Please upload an image first to describe.");
        return;
    }
    setIsDescribeLoading(true);
    setError('');
    try {
        const imagePart = await fileToGenerativePart(mainImage);
        const result = await callApi('describe', { imagePart });
        setPrompt(result.description);
    } catch (e: any) {
        setError(`Description failed: ${e.message}`);
    } finally {
        setIsDescribeLoading(false);
    }
  };
  
  const generateImage = async () => {
    const currentStyle = styles.find(s => s.name === activeStyle) || styles[0];
    const isSingleUploader = currentStyle.singleUploader;
  
    // Validation
    if (!prompt && currentStyle.prompt.includes("{prompt}")) {
      setError('Please enter a prompt.');
      return;
    }
    if (isSingleUploader && !mainImage) {
      setError('Please upload a main image.');
      return;
    }
    if (!isSingleUploader && (!mainImage || !styleImage)) {
      setError('Please upload both a main image and a style image for this mode.');
      return;
    }
  
    setIsLoading(true);
    setGeneratedImage(null);
    setError('');
  
    try {
      // Construct the final prompt
      const finalPrompt = currentStyle.prompt.replace('{prompt}', prompt);
  
      // Prepare image parts
      const imageParts: Part[] = [];
      if (mainImage) imageParts.push(await fileToGenerativePart(mainImage));
      if (!isSingleUploader && styleImage) imageParts.push(await fileToGenerativePart(styleImage));
  
      const result = await callApi('generate', { prompt: finalPrompt, imageParts });

      if (result.base64) {
        setGeneratedImage(`data:${result.mimeType};base64,${result.base64}`);
      } else {
        throw new Error('API did not return image data.');
      }
    } catch (e: any) {
      setError(`Generation failed: ${e.message}`);
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
              // Optionally reset other fields
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

  return (
    <>
        <header className="navbar">
            <div className="navbar-container">
                <h1>AI Image Transformer</h1>
            </div>
        </header>

        <main className="main-content">
            <section className="hero">
                <h2>Transform Your Ideas into Visual Reality</h2>
            </section>
            
            <div className="app-container">
                <aside className="controls-panel panel">
                <h2>Controls</h2>

                {/* --- Image Upload Section --- */}
                <div className="control-section">
                    <h3>{isBlendMode ? 'Upload Images' : 'Upload Image'}</h3>
                    {isBlendMode ? (
                        <div className="blend-uploader-container">
                             <p className="helper-text">Select a main image and a style image to blend them together.</p>
                             <div className="blend-inputs">
                                <div className="upload-box" onClick={() => mainImageInputRef.current?.click()}>
                                    <div className="upload-box-content">
                                        {mainImagePreview ? <img src={mainImagePreview} alt="Main Preview" className="upload-box-thumbnail"/> : <span className="upload-box-plus">+</span>}
                                    </div>
                                    <p className="upload-box-label">Main Image</p>
                                    <input ref={mainImageInputRef} type="file" accept="image/*" onChange={(e) => handleFileChange(e, setMainImage, setMainImagePreview)} style={{ display: 'none' }} />
                                </div>
                                <div className="upload-box" onClick={() => styleImageInputRef.current?.click()}>
                                    <div className="upload-box-content">
                                        {styleImagePreview ? <img src={styleImagePreview} alt="Style Preview" className="upload-box-thumbnail"/> : <span className="upload-box-plus">+</span>}
                                    </div>
                                    <p className="upload-box-label">Style Image</p>
                                    <input ref={styleImageInputRef} type="file" accept="image/*" onChange={(e) => handleFileChange(e, setStyleImage, setStyleImagePreview)} style={{ display: 'none' }} />
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="single-uploader-container">
                            <div className="upload-main-container">
                                {mainImagePreview && <img id="main-image-thumbnail" src={mainImagePreview} alt="Main preview" />}
                                <button className="upload-btn" onClick={() => mainImageInputRef.current?.click()}>
                                    {mainImage ? 'Change Image' : 'Choose Image'}
                                </button>
                                <input ref={mainImageInputRef} type="file" accept="image/*" onChange={(e) => handleFileChange(e, setMainImage, setMainImagePreview)} style={{ display: 'none' }} />
                            </div>
                        </div>
                    )}
                </div>

                {/* --- Style Selection --- */}
                <div className="control-section">
                    <h3>Style</h3>
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

                {/* --- Prompt Input --- */}
                <div className="control-section">
                    <h3>Prompt</h3>
                    <div className="prompt-container">
                    <textarea
                        id="prompt-input"
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        placeholder={
                            currentStyle.requiresPrompt 
                                ? `e.g., a futuristic cyberpunk city` 
                                : `Describe your vision...`
                        }
                        rows={4}
                    />
                     <button 
                        className="ai-describe-button" 
                        onClick={handleDescribe}
                        disabled={isDescribeLoading || !mainImage}
                        aria-label="Generate description from image"
                     >
                        {isDescribeLoading ? <span className="spinner-small"></span> : <DescribeIcon />}
                        AI Describe
                    </button>
                    </div>
                </div>

                {/* --- Options --- */}
                <div className="control-section">
                     <h3>Options</h3>
                     <div className="options-container">
                        <div className="option-item">
                            <label htmlFor="aspect-ratio">Aspect Ratio</label>
                            <select 
                                id="aspect-ratio" 
                                className="aspect-ratio-select"
                                value={aspectRatio} 
                                onChange={(e) => setAspectRatio(e.target.value)}
                                disabled={isAspectRatioLocked}
                            >
                                <option value="1:1">1:1 (Square)</option>
                                <option value="16:9">16:9 (Widescreen)</option>
                                <option value="9:16">9:16 (Vertical)</option>
                                <option value="4:3">4:3 (Standard)</option>
                                <option value="3:4">3:4 (Portrait)</option>
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
                                <label htmlFor="lock-aspect-ratio">Lock Aspect Ratio</label>
                            </div>
                        </div>
                     </div>
                </div>

                <button
                    className="transform-button"
                    onClick={generateImage}
                    disabled={isLoading}
                >
                    {isLoading ? 'Transforming...' : 'Transform'}
                </button>

                {error && <p className="error-message">{error}</p>}
                </aside>
                
                <div className="image-panel">
                <div className="panel" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                    <h3>Generated Image</h3>
                    <div className="image-placeholder">
                    {isLoading && (
                        <div className="loading-overlay">
                            <div className="spinner"></div>
                            <p>AI is thinking...</p>
                        </div>
                    )}
                    {generatedImage ? (
                        <>
                            <img src={generatedImage} alt="Generated" />
                            <div className="image-toolbar">
                                <button className="toolbar-button" onClick={() => handleDownload(generatedImage, 'generated')} aria-label="Download generated image">
                                    <DownloadIcon />
                                </button>
                                <div className="toolbar-divider"></div>
                                <button className="toolbar-button" onClick={handleUseAsInput} aria-label="Use as input">
                                    <UseAsInputIcon />
                                </button>
                                <div className="toolbar-divider"></div>
                                 <button className="toolbar-button" onClick={copyPromptToClipboard} aria-label="Copy prompt">
                                    <CopyIcon />
                                </button>
                            </div>
                        </>
                    ) : (
                        <div className="upload-prompt">
                            <p>Your generated image will appear here.</p>
                        </div>
                    )}
                    </div>
                </div>
                {mainImagePreview && (
                    <div className="panel" style={{ marginTop: '20px' }}>
                        <h3>Original Image</h3>
                        <div className="image-placeholder">
                            <img src={mainImagePreview} alt="Original" />
                             <div className="image-toolbar-single">
                                <button className="toolbar-button" onClick={() => handleDownload(mainImagePreview, 'original')} aria-label="Download original image">
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
            <p>Powered by Gemini AI. Created by IT PALUGADA.</p>
        </footer>
    </>
  );
};

const container = document.getElementById('root');
const root = createRoot(container!);
root.render(<App />);