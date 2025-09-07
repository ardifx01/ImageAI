import React, { useState, useCallback } from 'react';

// Helper to convert file to GoogleGenAI.Part
const fileToGenerativePart = async (file: File) => {
  const base64EncodedDataPromise = new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
    reader.readAsDataURL(file);
  });
  return {
    inlineData: {
      data: await base64EncodedDataPromise,
      mimeType: file.type,
    },
  };
};

const HomePage = () => {
  const [sourceImage, setSourceImage] = useState<string | null>(null);
  const [sourceImagePart, setSourceImagePart] = useState<any | null>(null);
  const [prompt, setPrompt] = useState('');
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setGeneratedImage(null);
    setError(null);
    setPrompt('');
    setSourceImage(URL.createObjectURL(file));
    
    try {
      const part = await fileToGenerativePart(file);
      setSourceImagePart(part);
    } catch (e) {
      setError('Error processing image file.');
      console.error(e);
    }
  };

  const handleDescribe = useCallback(async () => {
    if (!sourceImagePart) {
      setError('Please upload an image first.');
      return;
    }

    setIsLoading(true);
    setLoadingMessage('Generating description...');
    setError(null);
    setGeneratedImage(null);

    try {
      const response = await fetch('/api/describe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imagePart: sourceImagePart }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to get description.');
      }

      const { description } = await response.json();
      setPrompt(description);
    } catch (e: any) {
      setError(e.message);
      console.error(e);
    } finally {
      setIsLoading(false);
      setLoadingMessage('');
    }
  }, [sourceImagePart]);

  const handleGenerate = useCallback(async () => {
    if (!sourceImagePart || !prompt) {
      setError('Please upload an image and provide a prompt.');
      return;
    }

    setIsLoading(true);
    setLoadingMessage('Generating new image...');
    setError(null);
    setGeneratedImage(null);

    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, imageParts: [sourceImagePart] }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate image.');
      }

      const { base64, mimeType } = await response.json();
      setGeneratedImage(`data:${mimeType};base64,${base64}`);
    } catch (e: any) {
      setError(e.message);
      console.error(e);
    } finally {
      setIsLoading(false);
      setLoadingMessage('');
    }
  }, [sourceImagePart, prompt]);

  return (
    <>
      <style jsx global>{`
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto,
            Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
          background-color: #f0f2f5;
          color: #333;
          margin: 0;
          padding: 0;
          display: flex;
          justify-content: center;
        }
        .container {
          max-width: 1200px;
          width: 100%;
          padding: 2rem;
        }
        h1 {
          color: #1a73e8;
          text-align: center;
          margin-bottom: 2rem;
        }
        .main-content {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 2rem;
          align-items: start;
        }
        .column {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
          background: white;
          padding: 1.5rem;
          border-radius: 8px;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        }
        .image-preview {
          width: 100%;
          max-height: 400px;
          object-fit: contain;
          border-radius: 4px;
          border: 1px solid #ddd;
        }
        .placeholder {
          width: 100%;
          height: 300px;
          display: flex;
          align-items: center;
          justify-content: center;
          background-color: #fafafa;
          border: 2px dashed #ddd;
          border-radius: 4px;
          color: #888;
        }
        .button {
          background-color: #1a73e8;
          color: white;
          border: none;
          padding: 10px 20px;
          border-radius: 4px;
          font-size: 1rem;
          cursor: pointer;
          transition: background-color 0.3s;
          width: 100%;
        }
        .button:hover:not(:disabled) {
          background-color: #185abc;
        }
        .button:disabled {
          background-color: #a0c3ff;
          cursor: not-allowed;
        }
        textarea {
          width: 100%;
          min-height: 150px;
          font-family: inherit;
          font-size: 1rem;
          padding: 10px;
          border: 1px solid #ddd;
          border-radius: 4px;
          resize: vertical;
          box-sizing: border-box;
        }
        .loader {
          text-align: center;
          padding: 1rem;
        }
        .error {
          color: #d93025;
          background-color: #f8d7da;
          border: 1px solid #f5c6cb;
          padding: 1rem;
          border-radius: 4px;
          text-align: center;
          margin-bottom: 1rem;
        }
        .upload-wrapper {
          position: relative;
          width: 100%;
        }
        .upload-btn {
          background-color: #34a853;
        }
        .upload-btn:hover {
          background-color: #2c8c42;
        }
        .file-input {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          opacity: 0;
          cursor: pointer;
        }
        @media (max-width: 768px) {
          .main-content {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
      <div className="container">
        <h1>Gemini Image Editor</h1>
        {error && <div className="error">{error}</div>}
        <div className="main-content">
          <div className="column">
            <h2>1. Upload Image</h2>
            <div className="upload-wrapper">
              <button className="button upload-btn">Choose an Image</button>
              <input type="file" accept="image/*" onChange={handleImageUpload} className="file-input" />
            </div>
            {sourceImage ? (
              <img src={sourceImage} alt="Source" className="image-preview" />
            ) : (
              <div className="placeholder">Your image will appear here</div>
            )}
            <button
              onClick={handleDescribe}
              disabled={!sourceImage || isLoading}
              className="button"
            >
              Describe Image
            </button>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Image description will appear here, or you can write your own prompt..."
            />
            <button
              onClick={handleGenerate}
              disabled={!prompt || !sourceImage || isLoading}
              className="button"
            >
              Generate Variation
            </button>
          </div>
          <div className="column">
            <h2>2. Generated Image</h2>
            {isLoading && <div className="loader">{loadingMessage}</div>}
            {generatedImage ? (
              <img src={generatedImage} alt="Generated" className="image-preview" />
            ) : (
              <div className="placeholder">
                {!isLoading && 'Your generated image will appear here'}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default HomePage;
