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
const UpscaleIcon = () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M4 20L10 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M13 5H19V11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M5 11V5H11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M19 13V19H13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M19 5L14 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
);
const EnhanceIcon = () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 2.5L14.3267 9.67333L21.5 12L14.3267 14.3267L12 21.5L9.67333 14.3267L2.5 12L9.67333 9.67333L12 2.5Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
);
const RemoveBgIcon = () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 2.5C16.9706 2.5 21 6.52944 21 11.5C21 16.4706 16.9706 20.5 12 20.5C7.02944 20.5 3 16.4706 3 11.5C3 6.52944 7.02944 2.5 12 2.5Z" stroke="currentColor" strokeWidth="2"/>
        <path d="M21 3L3 21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
);
const ChangeBgIcon = () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M3 18.5L8.5 13L12.5 17L21 8.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M16 3.5H20C20.8284 3.5 21.5 4.17157 21.5 5V19C21.5 19.8284 20.8284 20.5 20 20.5H4C3.17157 20.5 2.5 19.8284 2.5 19V5C2.5 4.17157 3.17157 3.5 4 3.5H8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        <circle cx="12" cy="8.5" r="2" stroke="currentColor" strokeWidth="2"/>
    </svg>
);
const ColorBalanceIcon = () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M12 12L18.36 6.36" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M12 12L6.36 18.36" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M12 12L6.36 6.36" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M12 12L18.36 18.36" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
);
const AIDescribeIcon = () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 2.5L14.3267 9.67333L21.5 12L14.3267 14.3267L12 21.5L9.67333 14.3267L2.5 12L9.67333 9.67333L12 2.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M5 5L7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M17 17L19 19" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
);


// --- React Components ---

const ApiKeyModal = ({ onSave, initialKey }: { onSave: (key: string) => void, initialKey: string }) => {
    const [localApiKey, setLocalApiKey] = useState(initialKey || '');

    const handleSave = () => {
        if (localApiKey.trim()) {
            onSave(localApiKey.trim());
        }
    };

    return (
        <div className="api-key-modal-overlay">
            <div className="api-key-modal">
                <h3>Enter Your Google AI API Key</h3>
                <p>
                    To use this app, you need a Google AI API key. You can get your key from{' '}
                    <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer">
                        Google AI Studio
                    </a>.
                </p>
                <input
                    type="password"
                    value={localApiKey}
                    onChange={(e) => setLocalApiKey(e.target.value)}
                    placeholder="Paste your API key here"
                    className="api-key-input"
                />
                <button onClick={handleSave} className="api-key-save-button">Save & Continue</button>
            </div>
        </div>
    );
};

const Navbar = () => (
    <nav className="navbar">
        <div className="navbar-container">
            <h1>ImageAI IT PALUGADA</h1>
        </div>
    </nav>
);

const Hero = () => (
    <header className="hero">
        <div className="hero-container">
            <h2>Create Powerful Ai Art or Image in seconds.</h2>
        </div>
    </header>
);

const Footer = () => (
    <footer className="footer">
        <p>Copyright 2025 - Powered by IT PALUGADA</p>
    </footer>
);

interface ImageToolbarProps {
    onDownload: () => void;
    onUseAsInput: () => void;
    onCopy: () => void;
    onUpscale: () => void;
    onEnhance: () => void;
    onRemoveBg: () => void;
    onChangeBg: () => void;
    onColorBalance: () => void;
}

const ImageToolbar: React.FC<ImageToolbarProps> = ({ onDownload, onUseAsInput, onCopy, onUpscale, onEnhance, onRemoveBg, onChangeBg, onColorBalance }) => {
    const [copyFeedback, setCopyFeedback] = useState(false);

    const handleCopy = () => {
        onCopy();
        setCopyFeedback(true);
        setTimeout(() => setCopyFeedback(false), 2000);
    };

    return (
        <div className="image-toolbar">
            <button className="toolbar-button" onClick={onDownload} title="Download Image"><DownloadIcon /></button>
            <button className="toolbar-button" onClick={onUseAsInput} title="Use as Input"><UseAsInputIcon /></button>
            <button className="toolbar-button" onClick={handleCopy} title="Copy Image">
                {copyFeedback ? 'Copied!' : <CopyIcon />}
            </button>
            <div className="toolbar-divider"></div>
            <button className="toolbar-button" onClick={onUpscale} title="Upscale 2x"><UpscaleIcon /></button>
            <button className="toolbar-button" onClick={onEnhance} title="Enhance Quality"><EnhanceIcon /></button>
            <button className="toolbar-button" onClick={onRemoveBg} title="Remove Background"><RemoveBgIcon /></button>
            <button className="toolbar-button" onClick={onChangeBg} title="Change Background"><ChangeBgIcon /></button>
            <button className="toolbar-button" onClick={onColorBalance} title="Color Balance"><ColorBalanceIcon /></button>
        </div>
    );
};


interface ImagePlaceholderProps {
    image: { url: string; file: File | null } | null;
    isLoading: boolean;
    onImageUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
    isOriginal?: boolean;
    toolbarActions?: ImageToolbarProps;
    onDownload?: () => void;
}

const ImagePlaceholder: React.FC<ImagePlaceholderProps> = ({ image, isLoading, onImageUpload, isOriginal = false, toolbarActions, onDownload }) => {
    return (
        <div className="image-placeholder">
            {image?.url ? (
                <img src={image.url} alt={isOriginal ? 'Original' : 'Generated'} />
            ) : (
                <div className="upload-prompt">
                    {isOriginal && (
                        <>
                            <p>Upload an image to start</p>
                            <label className="upload-btn">
                                + Select Image
                                <input type="file" accept="image/*" onChange={onImageUpload} style={{ display: 'none' }} />
                            </label>
                        </>
                    )}
                </div>
            )}
            {isLoading && (
                <div className="loading-overlay">
                    <div className="spinner"></div>
                    <p>Generating...</p>
                </div>
            )}
            {!isOriginal && image?.url && toolbarActions && <ImageToolbar {...toolbarActions} />}
            {isOriginal && image?.url && onDownload && (
                <div className="image-toolbar-single">
                    <button className="toolbar-button" onClick={onDownload} title="Download Original Image">
                        <DownloadIcon />
                    </button>
                </div>
            )}
        </div>
    );
};

const App = () => {
    const [apiKey, setApiKey] = useState('');
    const [showApiKeyModal, setShowApiKeyModal] = useState(true);
    const [uploadedImage, setUploadedImage] = useState<{ url: string; file: File | null; aspectRatio: string }>({ url: '', file: null, aspectRatio: 'Original' });
    const [uploadedBgImage, setUploadedBgImage] = useState<{ url: string; file: File | null }>({ url: '', file: null });
    const [clothingImage, setClothingImage] = useState<{ url: string; file: File | null }>({ url: '', file: null });
    const [poseImage, setPoseImage] = useState<{ url: string; file: File | null }>({ url: '', file: null });
    const [generatedImage, setGeneratedImage] = useState<{ url: string; file: File | null }>({ url: '', file: null });
    const [prompt, setPrompt] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isDescribing, setIsDescribing] = useState(false);
    const [error, setError] = useState('');

    // Options state
    const [style, setStyle] = useState('Default');
    const [aspectRatio, setAspectRatio] = useState('Original');
    const [lockFace, setLockFace] = useState(true);
    const [preserveSubject, setPreserveSubject] = useState(false);
    const [preserveScene, setPreserveScene] = useState(false);

    const downloadCounter = useRef({ original: 1, generated: 1 });

    const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
        if (event.target.files && event.target.files[0]) {
            const file = event.target.files[0];
            const url = URL.createObjectURL(file);
            const img = new Image();
            img.onload = () => {
                const ratio = getAspectRatio(img.width, img.height);
                setUploadedImage({ url, file, aspectRatio: ratio });
                setAspectRatio(`Original (${ratio})`);
                if (!['Blend Photos', 'Foto Bersama', 'Ganti Baju', 'Pose'].includes(style)) {
                    setUploadedBgImage({ url: '', file: null });
                    setClothingImage({ url: '', file: null });
                    setPoseImage({ url: '', file: null });
                }
            };
            img.src = url;
        }
    };

    const handleBgImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
        if (event.target.files && event.target.files[0]) {
            const file = event.target.files[0];
            const url = URL.createObjectURL(file);
            setUploadedBgImage({ url, file });
        }
    };
    
    const handleClothingImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
        if (event.target.files && event.target.files[0]) {
            const file = event.target.files[0];
            const url = URL.createObjectURL(file);
            setClothingImage({ url, file });
        }
    };

    const handlePoseImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
        if (event.target.files && event.target.files[0]) {
            const file = event.target.files[0];
            const url = URL.createObjectURL(file);
            setPoseImage({ url, file });
        }
    };

    const selectStyle = (selectedStyle: string) => {
        if (selectedStyle === '+ Super Realistis') {
            const realisticPhrase = 'super realistic, indistinguishable from a photograph, lifelike textures, natural lighting';
            setPrompt(prevPrompt => {
                if (prevPrompt.toLowerCase().includes(realisticPhrase)) {
                    return prevPrompt; // Avoid duplication
                }
                // Add with a comma if prompt is not empty
                return prevPrompt ? `${prevPrompt}, ${realisticPhrase}` : realisticPhrase;
            });
            return; // Exit without changing the active style
        }
        
        setStyle(selectedStyle);
        // Reset images if switching to a style that doesn't use them
        if (!['Blend Photos', 'Foto Bersama'].includes(selectedStyle)) {
            setUploadedBgImage({ url: '', file: null });
        }
        if (selectedStyle !== 'Ganti Baju') {
            setClothingImage({ url: '', file: null });
        }
        if (selectedStyle !== 'Pose') {
            setPoseImage({ url: '', file: null });
        }


        switch (selectedStyle) {
            case 'Cinematic':
                setPrompt('Cinematic, dramatic lighting, high detail, epic, movie still');
                break;
            case 'Anime':
                setPrompt('Anime style, vibrant colors, detailed line art, cel shaded');
                break;
            case 'Watercolor':
                setPrompt('Watercolor painting, soft edges, blended colors, artistic');
                break;
            case 'Pixel Art':
                setPrompt('Pixel art, 16-bit, retro gaming style, limited palette');
                break;
            case 'Blend Photos':
                setPrompt('Seamlessly blend the subject from the first image into the scene of the second image. Match the lighting, shadows, and overall atmosphere for a realistic composite.');
                break;
            case 'Ganti Baju':
                setPrompt('Take the person from the first image and realistically dress them in the outfit from the second image. The final image should show the original person wearing the new clothes, maintaining their face, body, and the original background.');
                break;
            case 'Foto Bersama':
                 setPrompt('Take the main person from the first image and the main person from the second image and place them together in a single new photo, as if they are posing together. Ensure the lighting, shadows, and scale are consistent for both people to make the final image look like a real photograph taken at the same time. The setting is [DESCRIBE THE SCENE, STYLE, AND ATMOSPHERE HERE].');
                break;
            case 'Pose':
                setPrompt("Goal: Apply the pose from the second image (pose reference) to the character in the first image (subject).\n\nInstructions: Redraw the subject from the first image, making them adopt the exact pose of the person in the second image. The final image must keep the original subject's appearance, clothing, and background, but change their pose to match the reference. Faithfully copy the limb positions, body angle, and orientation from the reference pose.");
                break;
            case 'Action Figure':
                setPrompt('photo of a detailed action figure, plastic toy, articulated joints, miniature scale');
                break;
            case 'Action Figure Neon Lighting':
                setPrompt('Create a 1/7 scale commercialized figure of the-character in the illustration, in a hyper-realistic futuristic tech lab environment. Place the figure on a sturdy circular transparent acrylic base that serves as a physical support. Inside the acrylic base, embed glowing neon-blue circuit-like patterns, with geometric lines, microchip motifs, and radial light segments, giving the impression of advanced technology etched into the surface. The glowing circuits should cast soft reflections onto the desk surface while keeping the base solid and realistic. Next to the desk is the real person in the picture, in the real life size with the same attire as in the picture and the figurine, cleaning the figurine carefully with a fine brush. In the background, add a futuristic glass cabinet filled with multiple finished action figures arranged like a collector\'s display, highlighted by subtle neon lighting.');
                break;
            case 'Pixar Style':
                setPrompt('Pixar animation style, 3D render, cute and expressive characters, vibrant colors, detailed textures');
                break;
            case 'Sketsa':
                setPrompt('black and white pencil sketch, hand-drawn, hatching and cross-hatching, artistic sketch');
                break;
            case 'Ghibli Style':
                setPrompt('Studio Ghibli anime style, hand-drawn animation look, painterly backgrounds, whimsical, nostalgic');
                break;
            case 'Hyper Realistic':
                setPrompt('hyper-realistic, photorealistic, extremely high detail, sharp focus, 8k resolution');
                break;
            case 'Hyper Detail':
                setPrompt('hyper-detailed, intricate details, complex patterns, macro photography style');
                break;
            case 'Super Realistis':
                setPrompt('super realistic, indistinguishable from a photograph, lifelike textures, natural lighting');
                break;
            case 'Mewah':
                setPrompt('luxurious, elegant, opulent, high-end, rich materials like gold and velvet, sophisticated');
                break;
            case 'Miniature Actionfigure':
                setPrompt('Create a 1/7 scale commercial statue (character in the picture) with a realistic style in a real environment. 100% face lock similarity from the uploaded photo. The statue is placed on a computer desk. It has a round transparent acrylic base. Beside the table is a real person in the picture, with life-size and a real person in the picture and statue. Clean the statue carefully with a soft brush. In a modern style studio space with bright lighting. With some toy collections and action figures in the background.');
                break;
            case 'Aesthetic candid photography':
                setPrompt('Aesthetic candid photography, a young man casually on a high sidewalk, with a bus stop behind him after the rain. On the fogged glass of the bus stop, there are vulgar scribbles typical of rebellious youths, written with finger streaks on the mist, such as: “ASU!”, “Woi BABI!”, “Ngentotlah!”, and many more. The young man appears as if he’s waiting for a bus while holding a magazine. The camera also focuses on the reflection in the puddle on the asphalt, clearly showing the mirrored image. The water surface is slightly rippled, with lots of fallen leaves and white flowers, some floating. Foreground: a lush green tree above with white blossoms, along with water splashes caused by something dropping into the puddle. The subject is wearing an oversized black top, necklace, wide relaxed-fit jeans, a wristwatch, and white sneakers. The overall vibe is natural, realistic, with a moody tone, desaturated colors, evoking a melancholic yet aesthetic atmosphere.');
                break;
            case 'Elegant Hijab Woman':
                setPrompt('A stunning young woman in a shimmering turquoise hijab and gown stands gracefully on a futuristic glass bridge glowing with ethereal teal light. Her veil sparkles with tiny golden lights like constellations, creating a dreamy, magical aura. The embroidery on her dress is intricate and regal, with delicate lace details that shimmer softly. Behind her, the glass pathway reflects infinite glowing lights, stretching toward towering jagged cliffs illuminated by warm lanterns in the misty distance. The atmosphere feels surreal, cinematic, and enchanting blending elegance, fantasy, and modern architecture. Ultra realistic, highly detailed, soft cinematic lighting, dreamy bokeh, 8K, masterpiece, photorealism');
                break;
            case 'Expand Image':
                setPrompt('Expand the canvas of this image, intelligently filling in the new areas to create a larger, more complete scene. Maintain the original style and content while seamlessly extending the background and context. This is also known as outpainting or uncropping.');
                break;
            default:
                setPrompt('');
        }
    };
    
    const callGeminiApi = useCallback(async (currentPrompt: string, imageParts: Part[]) => {
        if (!apiKey) {
            setError('Please set your Google AI API Key first.');
            setShowApiKeyModal(true);
            return;
        }
        setIsLoading(true);
        setError('');
        setGeneratedImage({ url: '', file: null });

        try {
            const ai = new GoogleGenAI({ apiKey: apiKey });
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash-image-preview',
                contents: { parts: [...imageParts, { text: currentPrompt }] },
                config: {
                    responseModalities: [Modality.IMAGE, Modality.TEXT],
                },
            });

            const candidate = response.candidates?.[0];

            if (!candidate) {
                throw new Error("No response from the API. The request might have been blocked.");
            }
            
            if (candidate.finishReason === 'SAFETY') {
                 throw new Error("Image generation failed. The prompt or image may have violated safety policies. Please adjust your input and try again.");
            }

            let processedImage = false;
            let responseText = '';

            for (const part of candidate.content?.parts || []) {
                if (part.inlineData) {
                    const base64Data = part.inlineData.data;
                    const mimeType = part.inlineData.mimeType;
                    const imageUrl = `data:${mimeType};base64,${base64Data}`;
                    
                    const res = await fetch(imageUrl);
                    const blob = await res.blob();
                    const file = new File([blob], "generated_image.png", { type: mimeType });

                    setGeneratedImage({ url: imageUrl, file });
                    processedImage = true;
                    break; 
                } else if (part.text) {
                    responseText += part.text;
                }
            }

            if (!processedImage) {
                if (responseText) {
                     throw new Error(`API returned text instead of an image: "${responseText}"`);
                } else {
                     throw new Error("API did not return an image. It might have been blocked due to safety settings or a prompt issue. Please try a different prompt.");
                }
            }

        } catch (e) {
            const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred.';
            setError(`Failed to generate content: ${errorMessage}`);
            console.error(e);
        } finally {
            setIsLoading(false);
        }
    }, [apiKey]);

    const handleTransform = async () => {
        if (!uploadedImage.file) {
            setError('Please upload an original image first.');
            return;
        }
        if ((style === 'Blend Photos' || style === 'Foto Bersama') && !uploadedBgImage.file) {
            setError('Please upload a second image for this style.');
            return;
        }
        if (style === 'Ganti Baju' && !clothingImage.file) {
            setError('Please upload a clothing style image.');
            return;
        }
        if (style === 'Pose' && !poseImage.file) {
            setError('Please upload a pose reference image.');
            return;
        }


        let fullPrompt = prompt;
        const optionsText: string[] = [];
        if (lockFace) optionsText.push('keep the original face identical');
        if (preserveSubject) optionsText.push('preserve the main subject');
        if (preserveScene) optionsText.push('preserve the overall scene composition');

        if (!aspectRatio.startsWith('Original')) {
            const ratioValue = aspectRatio;
            const aspectRatioInstruction = `The highest priority is to change the image's aspect ratio to ${ratioValue}. Re-render the entire scene to fit these new dimensions. If the new aspect ratio is wider or taller, intelligently expand the background and scene using outpainting techniques. If the new aspect ratio requires cropping, creatively frame the main subject to best fit the new dimensions. The final generated image MUST have a ${ratioValue} aspect ratio.`;
            // Prepend the instruction for high priority
            fullPrompt = `${aspectRatioInstruction} The original creative prompt is: "${fullPrompt}"`;
        }

        if (optionsText.length > 0) {
            fullPrompt += `. Additional options to follow: ${optionsText.join(', ')}.`;
        }

        const imageParts: Part[] = [await fileToGenerativePart(uploadedImage.file)];
        if (uploadedBgImage.file && ['Blend Photos', 'Foto Bersama'].includes(style)) {
             imageParts.push(await fileToGenerativePart(uploadedBgImage.file));
        } else if (clothingImage.file && style === 'Ganti Baju') {
            imageParts.push(await fileToGenerativePart(clothingImage.file));
        } else if (poseImage.file && style === 'Pose') {
            imageParts.push(await fileToGenerativePart(poseImage.file));
        }


        callGeminiApi(fullPrompt, imageParts);
    };

    const handleSecondaryTransform = async (transformPrompt: string) => {
        if (!generatedImage.file) {
            setError('There is no generated image to transform.');
            return;
        }
        const imageParts: Part[] = [await fileToGenerativePart(generatedImage.file)];
        callGeminiApi(transformPrompt, imageParts);
    };

    const handleAIDescribe = async () => {
        if (!uploadedImage.file) {
            setError('Please upload an image to describe.');
            return;
        }
        if (!apiKey) {
            setError('Please set your Google AI API Key first.');
            setShowApiKeyModal(true);
            return;
        }
        setIsDescribing(true);
        setError('');
        try {
            const imagePart = await fileToGenerativePart(uploadedImage.file);
            const describePrompt = "Act as a professional photographer. Describe this image in vivid detail, focusing on the main subject, setting, lighting, composition, colors, and overall mood. The description should be suitable to be used as a prompt to recreate a similar image with an AI image generator.";

            const ai = new GoogleGenAI({ apiKey: apiKey });
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: { parts: [imagePart, { text: describePrompt }] },
            });

            const description = response.text;
            if (description) {
                setPrompt(description);
            } else {
                setError("AI couldn't generate a description for this image.");
            }
        } catch (e) {
            const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred.';
            setError(`Failed to generate description: ${errorMessage}`);
            console.error(e);
        } finally {
            setIsDescribing(false);
        }
    };

    const handleUseAsInput = () => {
        if (generatedImage.url && generatedImage.file) {
            const img = new Image();
            img.onload = () => {
                 const ratio = getAspectRatio(img.width, img.height);
                 setUploadedImage({ 
                    url: generatedImage.url, 
                    file: generatedImage.file, 
                    aspectRatio: ratio 
                });
                setAspectRatio(`Original (${ratio})`);
            };
            img.src = generatedImage.url;
            setGeneratedImage({ url: '', file: null });
        }
    };
    
    const handleDownload = () => {
        if (generatedImage.url) {
            const filename = generateFilename('generated', style, '', downloadCounter.current.generated);
            const a = document.createElement('a');
            a.href = generatedImage.url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            downloadCounter.current.generated++;
        }
    };

    const handleOriginalDownload = () => {
        if (uploadedImage.url && uploadedImage.file) {
            const filename = generateFilename('original', '', uploadedImage.file.name, downloadCounter.current.original);
            const a = document.createElement('a');
            a.href = uploadedImage.url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            downloadCounter.current.original++;
        }
    };

    const handleCopy = async () => {
        if (generatedImage.url) {
            try {
                const response = await fetch(generatedImage.url);
                const blob = await response.blob();
                await navigator.clipboard.write([
                    new ClipboardItem({ [blob.type]: blob })
                ]);
            } catch (err) {
                console.error('Failed to copy image: ', err);
                setError('Failed to copy image to clipboard.');
            }
        }
    };

    const handleUpscale = () => {
        handleSecondaryTransform("Upscale the image to 2x its original resolution, enhancing details without adding new elements.");
    };

    const handleEnhanceQuality = () => {
        handleSecondaryTransform("Enhance the overall quality of this image, improving clarity, color balance, and sharpness.");
    };

    const handleRemoveBackground = () => {
        handleSecondaryTransform("Remove the background from this image, leaving only the main subject with a transparent background.");
    };
    
    const handleChangeBackground = () => {
        const newBgPrompt = window.prompt("Describe the new background you want:", "A beautiful beach at sunset");
        if (newBgPrompt) {
            handleSecondaryTransform(`Change the background to: ${newBgPrompt}. Make sure the subject is seamlessly integrated.`);
        }
    };

    const handleColorBalance = () => {
        const adjustment = window.prompt("Describe the color balance adjustment:", "Make the image warmer and more saturated");
        if (adjustment) {
            handleSecondaryTransform(`Adjust the color balance of the image. The user requested: "${adjustment}". Keep the subject and all elements the same, only change the color tones.`);
        }
    };

    const toolbarActions: ImageToolbarProps = {
        onDownload: handleDownload,
        onUseAsInput: handleUseAsInput,
        onCopy: handleCopy,
        onUpscale: handleUpscale,
        onEnhance: handleEnhanceQuality,
        onRemoveBg: handleRemoveBackground,
        onChangeBg: handleChangeBackground,
        onColorBalance: handleColorBalance,
    };

    const styleButtons = [
        'Default', 'Cinematic', 'Anime', 'Watercolor', 'Pixel Art', 'Blend Photos', 'Foto Bersama', 'Ganti Baju', 'Pose',
        'Action Figure', 'Action Figure Neon Lighting', 'Pixar Style', 'Sketsa', 'Ghibli Style', 'Hyper Realistic', 
        'Hyper Detail', 'Super Realistis', '+ Super Realistis', 'Mewah', 'Miniature Actionfigure', 'Aesthetic candid photography', 'Elegant Hijab Woman', 'Expand Image'
    ];
    
    const showTwoUploders = ['Blend Photos', 'Foto Bersama', 'Ganti Baju', 'Pose'].includes(style);

    const getUploaderInfo = () => {
        switch (style) {
            case 'Blend Photos':
                return {
                    helperText: 'Upload a subject image and a background image to blend.',
                    label1: 'Subject',
                    label2: 'Background',
                    image2: uploadedBgImage,
                    handler2: handleBgImageUpload,
                };
            case 'Foto Bersama':
                return {
                    helperText: 'Upload a photo of each person to combine them.',
                    label1: 'Person 1',
                    label2: 'Person 2',
                    image2: uploadedBgImage,
                    handler2: handleBgImageUpload,
                };
            case 'Ganti Baju':
                 return {
                    helperText: 'Upload a photo of a person and a photo of the desired clothing style.',
                    label1: 'Person',
                    label2: 'Clothing Style',
                    image2: clothingImage,
                    handler2: handleClothingImageUpload,
                };
            case 'Pose':
                 return {
                    helperText: 'Upload a subject image and a reference image for the desired pose.',
                    label1: 'Subject',
                    label2: 'Pose Reference',
                    image2: poseImage,
                    handler2: handlePoseImageUpload,
                };
            default:
                return { helperText: '', label1: '', label2: '', image2: null, handler2: () => {} };
        }
    };
    const uploaderInfo = getUploaderInfo();

    return (
        <>
            {showApiKeyModal && <ApiKeyModal onSave={(key) => { setApiKey(key); setShowApiKeyModal(false); setError(''); }} initialKey={apiKey} />}
            <Navbar />
            <main className="main-content">
                <Hero />
                <div className="app-container">
                    <div className="panel controls-panel">
                        <h2>Controls</h2>

                        <div className="control-section">
                            <h3>1. Original Image</h3>
                             {showTwoUploders ? (
                                <div className="blend-uploader-container">
                                    <p className="helper-text">{uploaderInfo.helperText}</p>
                                    <div className="blend-inputs">
                                        <label className="upload-box">
                                            <span className="upload-box-label">{uploaderInfo.label1}</span>
                                            <div className="upload-box-content">
                                                {uploadedImage.url ? (
                                                    <img src={uploadedImage.url} alt={uploaderInfo.label1} className="upload-box-thumbnail" />
                                                ) : (
                                                    <span className="upload-box-plus">+</span>
                                                )}
                                            </div>
                                            <input type="file" accept="image/*" onChange={handleImageUpload} />
                                        </label>
                                        <label className={`upload-box ${!uploadedImage.file ? 'disabled' : ''}`}>
                                             <span className="upload-box-label">{uploaderInfo.label2}</span>
                                            <div className="upload-box-content">
                                                {uploaderInfo.image2?.url ? (
                                                    <img src={uploaderInfo.image2.url} alt={uploaderInfo.label2} className="upload-box-thumbnail" />
                                                ) : (
                                                    <span className="upload-box-plus">+</span>
                                                )}
                                            </div>
                                            <input type="file" accept="image/*" onChange={uploaderInfo.handler2} disabled={!uploadedImage.file} />
                                        </label>
                                    </div>
                                </div>
                            ) : (
                                <div className="single-uploader-container">
                                     <div className="upload-main-container">
                                        {uploadedImage.url && <img id="main-image-thumbnail" src={uploadedImage.url} alt="Uploaded thumbnail" />}
                                        <label className="upload-btn">
                                            {uploadedImage.url ? 'Change' : '+ Select'}
                                            <input type="file" accept="image/*" onChange={handleImageUpload} style={{ display: 'none' }} />
                                        </label>
                                    </div>
                                </div>
                            )}
                        </div>


                        <div className="control-section">
                            <h3>2. Style</h3>
                            <div className="style-selector">
                                {styleButtons.map(s => (
                                    <button key={s} className={`style-button ${style === s ? 'active' : ''}`} onClick={() => selectStyle(s)}>
                                        {s}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="control-section">
                            <h3>3. Prompt</h3>
                            <div className="prompt-container">
                                <textarea
                                    id="prompt-input"
                                    value={prompt}
                                    onChange={(e) => setPrompt(e.target.value)}
                                    placeholder="e.g., A cat wearing a superhero cape"
                                    rows={4}
                                />
                                <button 
                                    className="ai-describe-button" 
                                    onClick={handleAIDescribe} 
                                    disabled={!uploadedImage.file || isDescribing || isLoading || !apiKey}
                                    title="Generate a prompt from the original image"
                                >
                                    <AIDescribeIcon />
                                    {isDescribing ? 'Describing...' : 'AI Describe'}
                                </button>
                            </div>
                        </div>
                        
                         <div className="control-section">
                            <h3>4. Options</h3>
                            <div className="options-container">
                                <div className="option-item">
                                    <label htmlFor="aspect-ratio">Aspect Ratio</label>
                                    <select 
                                        id="aspect-ratio" 
                                        className="aspect-ratio-select"
                                        value={aspectRatio}
                                        onChange={(e) => setAspectRatio(e.target.value)}
                                        disabled={!uploadedImage.file}
                                    >
                                        <option value={`Original (${uploadedImage.aspectRatio})`}>Original ({uploadedImage.aspectRatio})</option>
                                        <option value="1:1">Square (1:1)</option>
                                        <option value="16:9">Widescreen (16:9)</option>
                                        <option value="9:16">Portrait (9:16)</option>
                                        <option value="4:3">Landscape (4:3)</option>
                                        <option value="3:4">Vertical (3:4)</option>
                                    </select>
                                </div>
                                <div className="option-item checkbox-group">
                                    <div className="checkbox-container">
                                        <input type="checkbox" id="lock-face" checked={lockFace} onChange={(e) => setLockFace(e.target.checked)} />
                                        <label htmlFor="lock-face">Lock Face (100%)</label>
                                    </div>
                                    <div className="checkbox-container">
                                        <input type="checkbox" id="preserve-subject" checked={preserveSubject} onChange={(e) => setPreserveSubject(e.target.checked)} />
                                        <label htmlFor="preserve-subject">Preserve Subject</label>
                                    </div>
                                    <div className="checkbox-container">
                                        <input type="checkbox" id="preserve-scene" checked={preserveScene} onChange={(e) => setPreserveScene(e.target.checked)} />
                                        <label htmlFor="preserve-scene">Preserve Scene</label>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <button className="transform-button" onClick={handleTransform} disabled={isLoading || isDescribing || !uploadedImage.file || !apiKey}>
                            {isLoading ? 'Generating...' : 'Transform Image'}
                        </button>
                        {error && <p className="error-message">{error}</p>}
                        <button className="change-api-key-button" onClick={() => setShowApiKeyModal(true)}>
                            Change API Key
                        </button>
                    </div>

                    <div className="panel image-panel">
                        <h3>Original</h3>
                        <ImagePlaceholder
                            image={uploadedImage}
                            isLoading={false}
                            onImageUpload={handleImageUpload}
                            isOriginal={true}
                            onDownload={handleOriginalDownload}
                        />
                    </div>

                    <div className="panel image-panel">
                        <h3>Generated</h3>
                        <ImagePlaceholder image={generatedImage} isLoading={isLoading} onImageUpload={() => {}} toolbarActions={toolbarActions} />
                    </div>
                </div>
            </main>
            <Footer />
        </>
    );
};

const root = createRoot(document.getElementById('root')!);
root.render(<App />);