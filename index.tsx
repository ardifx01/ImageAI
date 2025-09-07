import React, { useState, useCallback, useRef, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import type { Part } from "@google/genai"; // Hanya menggunakan tipe, bukan seluruh library

// --- Fungsi Bantuan ---

/**
 * Mengubah ukuran gambar jika dimensinya melebihi batas maksimal.
 * @param file File gambar yang akan diubah ukurannya.
 * @param maxDimension Dimensi maksimal (lebar atau tinggi).
 * @returns Promise yang diselesaikan dengan File gambar yang telah diubah ukurannya.
 */
const resizeImage = (file: File, maxDimension: number): Promise<File> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target!.result as string;
      img.onload = () => {
        let { width, height } = img;
        if (width > height) {
          if (width > maxDimension) {
            height *= maxDimension / width;
            width = maxDimension;
          }
        } else {
          if (height > maxDimension) {
            width *= maxDimension / height;
            height = maxDimension;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          return reject(new Error('Tidak dapat mendapatkan konteks kanvas'));
        }
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob((blob) => {
          if (blob) {
            const resizedFile = new File([blob], file.name, { type: file.type, lastModified: Date.now() });
            resolve(resizedFile);
          } else {
            reject(new Error('Gagal membuat blob dari kanvas.'));
          }
        }, file.type, 0.9); // Kualitas 90% untuk unggahan yang lebih cepat
      };
      img.onerror = reject;
    };
    reader.onerror = reject;
  });
};


/**
 * Mengonversi file menjadi objek yang dapat dikirim ke backend.
 * @param file File yang akan dikonversi.
 * @returns Promise yang diselesaikan dengan objek yang berisi data base64 dan tipe mime.
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
    { name: 'Default', prompt: '{prompt}', singleUploader: true, placeholder: 'Jelaskan visi Anda... (misalnya, seekor anjing astronaut di bulan)' },
    { name: 'Kartun', prompt: 'Gaya kartun: ilustrasi ceria, garis tebal, warna-warna cerah. {prompt}', singleUploader: true },
    { name: 'Fantasi', prompt: 'Gaya fantasi: pemandangan epik, elemen magis, atmosfer seperti mimpi. {prompt}', singleUploader: true },
    { name: 'Fotorealistik', prompt: 'Gaya fotorealistik: detail tajam, pencahayaan dan tekstur yang disempurnakan. {prompt}', singleUploader: true },
    { name: 'Ganti Latar', prompt: 'Subjek utama dengan latar belakang baru: {prompt}', singleUploader: true, requiresPrompt: true, placeholder: 'Jelaskan latar belakang baru, misalnya: di pantai saat senja' },
    { name: 'Ganti Pakaian', prompt: 'Subjek mengenakan pakaian yang berbeda: {prompt}', singleUploader: true, requiresPrompt: true, placeholder: 'Jelaskan pakaian baru, misalnya: jaket kulit hitam dan jeans' },
    { name: 'Ganti Rambut', prompt: 'Subjek dengan gaya rambut baru: {prompt}', singleUploader: true, requiresPrompt: true, placeholder: 'Jelaskan gaya rambut baru, misalnya: rambut pendek berwarna biru' },
    { name: 'Model Aestetik', prompt: 'Gaya model estetis: postur elegan, pencahayaan dramatis, komposisi artistik. {prompt}', singleUploader: true },
    { name: 'Monochrome for Man', prompt: 'Foto monokrom profil samping seorang pria, cahaya menyoroti tepi rambut dan wajah, latar belakang gelap, menonjolkan siluet. {prompt}', singleUploader: true },
    { name: 'Monochrome for woman', prompt: 'Foto monokrom profil samping seorang wanita, cahaya menyoroti tepi rambut dan wajah, latar belakang gelap, menonjolkan siluet. {prompt}', singleUploader: true },
    { name: 'Cinematic candid', prompt: 'Cinematic candid photography with a blend of Matte Film Look preset, Soft Fade Shadows, and subtle grain effect. Featuring a handsome young man like the attached reference photo. He stands cool and relaxed in the golden savanna of Wairinding, Sumba. His body faces slightly sideways, one hand in his pants pocket while the other tosses a traveler tumbler into the air. The tumbler is blurred, spinning above his hand. Outfit: oversized cream linen shirt, loose khaki pants, classic white sneakers, and a sporty watch. He has a high-end Canon camera slung around his neck. The shot is taken from a low angle hidden behind the tall wild savanna grass, with slightly blurred grass in the foreground creating dreamy depth and a natural frame on the side of the frame. The subject and spinning tumbler are in sharp focus, with the background of golden savanna hills and soft blue sky. Warm late-afternoon light gently illuminates the scene, giving pastel tones with faded highlights and softly fading shadows, creating a cinematic, dreamy, and timeless atmosphere. {prompt}', singleUploader: true },
    { name: 'Selfie with Artist', prompt: 'Make it so that I am taking a selfie with {prompt} a backstage concert in America. Make the natural lighting photo', singleUploader: true, requiresPrompt: true, placeholder: 'Sebutkan nama artis, misalnya: Taylor Swift' },
    { name: 'Gantungan Kunci', prompt: 'Buat gantungan kunci figur karet 1:10, dengan jari-jari memegangnya. Latar belakang buram, tali gantungan kunci karet {prompt}', singleUploader: true, requiresPrompt: true, placeholder: 'Isi detailnya, misalnya: berwarna biru dengan tulisan \'BALI\' putih' },
    { name: 'Action Figure with Maker', prompt: 'Create a 1/7 scale commercialized figurine of (the character in the picture) , realistic style, in a real environment. Figurine placed on a computer desk. has a round transparent acrylic base. Next to the desk is the real person in the picture, in the real life size with the same attire as in the picture and the figurine, cleaning the figurine carefully with a fine brush. in a modern styled studio room, brightly lit. With some collection of toys and action figures in the background. {prompt}', singleUploader: true, placeholder: 'Tambahkan detail kecil jika diinginkan...' },
    { name: 'Hyper Realistic', prompt: 'Enhance this image to be hyper-realistic. Improve the lighting, sharpen the details, and make the textures appear more lifelike, as if it were a high-resolution photograph. {prompt}', singleUploader: true, placeholder: 'Tambahkan detail kecil jika diinginkan...' },
    { name: 'Miniature Action figure', prompt: 'Create a 1/7 scale commercial statue (character in the picture) with a realistic style in a real environment. 100% face lock similarity from the uploaded photo. The statue is placed on a computer desk. It has a round transparent acrylic base. Beside the table is a real person in the picture, with life-size and a real person in the picture and statue. Clean the statue carefully with a soft brush. In a modern style studio space with bright lighting. With some toy collections and action figures in the background. {prompt}', singleUploader: true, placeholder: 'Tambahkan detail kecil jika diinginkan...' },
    { name: 'Super Realistic', prompt: "Critically important: Do not change the person's face or identity at all. The final result must be 100% identical to the original person. Enhance this image to be super-realistic. Sharpen details, refine lighting and shadows, improve skin texture, and make it look like an ultra-high-resolution, professionally shot photograph. The goal is maximum realism without altering the subject's core features. {prompt}", singleUploader: true, placeholder: 'Tambahkan detail kecil jika diinginkan...' },
    { name: 'Mewah', prompt: "Hands in Pockets – Relaxed Authority. A hyper-realistic, cinematic editorial portrait of the person being uploaded (keep the face 100%). They stand upright in a dark, gloomy studio, surrounded by billowing smoke under dramatic lighting. Clothing: As per the uploaded reference photo. Both hands are casually tucked into their pockets, shoulders relaxed, a confident expression, and the head is slightly tilted. Make it hyper-realistic, 8k, sharp focus, detailed textures, cinematic lighting. {prompt}", singleUploader: true, placeholder: 'Tambahkan detail kecil jika diinginkan...' },
    { name: 'Diorama', prompt: "A hyper-realistic, high-quality photograph of a miniature diorama. The diorama is a 100% accurate replica of the building and its surroundings from the uploaded photo, capturing every architectural detail, texture, and color. It's built with realistic materials like 3D-printed resin and acrylic, with detailed landscaping using miniature moss and sand. Warm, inviting miniature LED lights create a deep, atmospheric scene. The entire diorama is elegantly displayed on a luxurious marble table against a plain, soft, warm-colored background. The overall image has high contrast and sharp focus. Critically important: Any visible text from the original photo must be perfectly replicated. {prompt}", singleUploader: true, placeholder: 'Tambahkan detail kecil jika diinginkan...' },
    { name: 'Enhance Picture', prompt: 'Enhance this picture to improve its overall quality. Increase sharpness, clarity, and vibrancy of colors, and improve the lighting without changing the original content or style. Make it look like a professionally remastered high-resolution photo. {prompt}', singleUploader: true, placeholder: 'Tambahkan detail kecil jika diinginkan...' },
    { name: 'Monokrom Luxuri', prompt: "Use the face in this photo for a black-and-white studio shoot, showcasing 100% similarity in facial features and style to the uploaded photo. The lighting is soft and minimalist, creating sharp shadows and a moody atmosphere. The pose is relaxed, leaning slightly with one arm on the back of the chair, her face turned to the side. The background is plain, with a simple, modern aesthetic. Create hyperrealism, 8K, sharp focus, detailed textures, and cinematic lighting. {prompt}", singleUploader: true, placeholder: 'Tambahkan detail kecil jika diinginkan...' },
    { name: 'Efek Bokeh', prompt: 'Tambahkan efek bokeh yang halus di latar belakang gambar ini, membuat subjek utama lebih menonjol. Pertahankan fokus tajam pada subjek. {prompt}', singleUploader: true, placeholder: 'Tambahkan detail kecil jika diinginkan...' },
    { name: 'Naik Vespa Kecil (Man)', prompt: "A Southeast Asian man. He wears a plain white oversized t-shirt, beige chinos, white flip-flops, black hair, and a beige snapback hat worn backwards. He's riding a brightly colored plastic Vespa toy motorcycle, minuscule compared to his body. While it looks goofy, his pose is very serious: his body is sharply angled toward a corner, his hairy legs off the ground, his knees bent tightly to the side of the motorcycle, an extreme cornering style reminiscent of MotoGP. Neither foot is on the ground. His facial expression is focused and concentrated, as if he were in a real race. The city street backdrop features dramatic motion blur to give the impression of high speed. The textures are hyper-realistic: his face, clothing, small plastic motorcycle, and the details of his flip-flops all look real. The contrast between the absurd toy motorcycle and the style of professional racing creates a comedic yet epic result. {prompt}", singleUploader: true, placeholder: 'Tambahkan detail kecil jika diinginkan...' },
    { name: 'Naik Yamaha Filano', prompt: 'A hyper-realistic, cinematic shot of the person in the photo riding a sleek, modern Yamaha Filano scooter. The setting is a beautiful, quiet, winding asphalt road flanked by lush green scenery under a clear blue sky. The late afternoon sun casts a warm, golden glow. The rider looks relaxed and content, enjoying the journey. There\'s a slight motion blur in the background to emphasize the sense of a smooth, peaceful ride. 8K, sharp focus on the rider and motorcycle, detailed textures. {prompt}', singleUploader: true, placeholder: 'Tambahkan detail kecil jika diinginkan...' },
    { name: 'Naik Yamaha XSR', prompt: 'An editorial-style, hyper-realistic photograph. The person from the uploaded photo is riding a powerful Yamaha XSR motorcycle on a scenic, empty road at twilight. The bike\'s iconic round headlight is on, cutting through the dusky light. The rider has a confident posture. The background features a dramatic landscape like mountains or a coastline. The atmosphere is cool, adventurous, and slightly moody. Shot with a prime lens for a shallow depth of field, focusing sharply on the rider and the bike. 8K, high detail, cinematic color grading. {prompt}', singleUploader: true, placeholder: 'Tambahkan detail kecil jika diinginkan...' },
    { name: 'Golden hour for Man', prompt: 'Golden hour 8K vertical: Young man leans on mountain road railing beneath a tree in dense forest. Casual pose, checkered shirt rolled sleeves, Nike tee, black cargo pants, Converse, baseball cap. Sunbeams pierce foliage, casting warm cinematic teal shadows. Soft breeze moves shirt hem, blurred bokeh background with subtle bird flight. Sharp 50mm f/1.8 focus on textures and glow. Rule of thirds, leading lines. {prompt}', singleUploader: true, placeholder: 'Tambahkan detail kecil jika diinginkan...' },
    { name: 'Golden hour for woman', prompt: 'Golden hour 8K vertical: Young woman leans on mountain road railing beneath a tree in dense forest. Casual pose, checkered shirt rolled sleeves, Nike tee, black cargo pants, Converse, baseball cap. Sunbeams pierce foliage, casting warm cinematic teal shadows. Soft breeze moves shirt hem, blurred bokeh background with subtle bird flight. Sharp 50mm f/1.8 focus on textures and glow. Rule of thirds, leading lines. {prompt}', singleUploader: true, placeholder: 'Tambahkan detail kecil jika diinginkan...' },
    { name: 'Ghibli Style', prompt: 'Transform this into the beautiful, hand-painted art style of a Studio Ghibli film. Emphasize lush natural landscapes, soft lighting, vibrant colors, and a whimsical, nostalgic atmosphere. {prompt}', singleUploader: true, placeholder: 'Tambahkan detail kecil jika diinginkan...' },
    { name: 'Pixar Style', prompt: 'Transform the subject into a friendly 3D character in the style of a Pixar movie. The character should have a proportionally larger head, wide expressive eyes, and a warm smile, based on the person in the photo. The scene should be brightly lit with a clean background inspired by the original photo. {prompt}', singleUploader: true, placeholder: 'Tambahkan detail kecil jika diinginkan...' },
    { name: 'Vintage film', prompt: 'Transform this image to look like a vintage 35mm film photo, with grainy texture, warm faded colors, and subtle light leaks. {prompt}', singleUploader: true, placeholder: 'Tambahkan detail kecil jika diinginkan...' },
    { name: 'Retro Smoke', prompt: 'A full-shot image captures a man, wearing a stylish denim jacket over a white t-shirt and grey jeans. He is leaning against a vintage orange car, with one arm casually resting on the car\'s roof and the other holding a cigarette to his lips, exhaling smoke that billows around him. The man\'s gaze is directed upwards, his expression contemplative. The background is blurred, featuring a soft, bright light that creates a hazy, dreamlike atmosphere. The overall aesthetic is cinematic and moody, with a slight sepia tone enhancing the vintage feel. {prompt}', singleUploader: true, placeholder: 'Tambahkan detail kecil jika diinginkan...' },
    { name: 'Campuran Gambar', prompt: 'Perpaduan artistik dari dua gambar. {prompt}', singleUploader: false },
    { name: 'Pakaian dari Gambar', prompt: 'Kenakan pakaian dari gambar kedua pada orang di gambar pertama. Pertahankan pose, wajah, dan latar belakang orang tersebut, tetapi ganti pakaian mereka. {prompt}', singleUploader: false },
    { name: 'Pose Bersama', prompt: 'Sebuah foto studio tunggal yang fotorealistik. Di dalam foto, orang dari gambar pertama dan orang dari gambar kedua berpose bersama secara alami. Latar belakangnya adalah studio yang bersih dan netral. Fitur wajah kedua individu terjaga sempurna dan 100% identik dengan gambar sumber. {prompt}', singleUploader: false, placeholder: 'Tambahkan detail, mis: di taman kota, gaya kasual...' },
    { name: 'Selfie Bareng', prompt: 'Sebuah foto selfie close-up yang fotorealistik. Di dalam foto, orang dari gambar pertama dan orang dari gambar kedua berpose bersama seolah-olah sedang mengambil selfie. Latar belakangnya adalah {prompt}. Fitur wajah kedua individu terjaga sempurna dan 100% identik dengan gambar sumber.', singleUploader: false, placeholder: 'mis: di puncak gunung, di sebuah kafe...' },
];

const loadingMessages = [
    "Mempersiapkan gambar Anda...",
    "Mengirim permintaan ke Gemini AI...",
    "AI sedang menganalisis permintaan Anda...",
    "Menciptakan keajaiban visual...",
    "Menyempurnakan detail akhir...",
    "Hampir selesai, sentuhan terakhir..."
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
  const [isFaceLocked, setIsFaceLocked] = useState<boolean>(false);
  const [mainImagePreview, setMainImagePreview] = useState<string | null>(null);
  const [styleImagePreview, setStyleImagePreview] = useState<string | null>(null);
  const [isDescribeLoading, setIsDescribeLoading] = useState<boolean>(false);
  const [loadingMessage, setLoadingMessage] = useState<string>(loadingMessages[0]);
  
  // Ref untuk input file
  const mainImageInputRef = useRef<HTMLInputElement>(null);
  const styleImageInputRef = useRef<HTMLInputElement>(null);
  const downloadCounter = useRef(1);

  // Efek untuk menangani pesan pemuatan dinamis
  useEffect(() => {
    let intervalId: number | undefined;
    if (isLoading) {
      let messageIndex = 0;
      setLoadingMessage(loadingMessages[messageIndex]);
      intervalId = window.setInterval(() => {
        messageIndex = (messageIndex + 1) % loadingMessages.length;
        setLoadingMessage(loadingMessages[messageIndex]);
      }, 3500); // Ganti pesan setiap 3.5 detik
    }
    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [isLoading]);

  // --- Handler ---

  const handleFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>,
    setImage: React.Dispatch<React.SetStateAction<File | null>>,
    setPreview: React.Dispatch<React.SetStateAction<string | null>>
  ) => {
    const file = e.target.files?.[0];
    if (file) {
        try {
            setError('');
            // Langkah 1: Tangani rasio aspek berdasarkan gambar asli
            if (setImage === setMainImage && !isAspectRatioLocked) {
                const img = new Image();
                // Gunakan promise untuk memastikan rasio aspek diatur sebelum melanjutkan
                await new Promise<void>((resolve, reject) => {
                    img.onload = () => {
                        setAspectRatio(getClosestAspectRatio(img.width, img.height));
                        URL.revokeObjectURL(img.src); // Bersihkan object URL
                        resolve();
                    };
                    img.onerror = () => {
                        URL.revokeObjectURL(img.src);
                        reject(new Error("Gagal memuat gambar untuk menentukan rasio aspek."));
                    };
                    img.src = URL.createObjectURL(file);
                });
            }

            // Langkah 2: Ubah ukuran gambar untuk optimisasi
            const resizedFile = await resizeImage(file, 1024);

            // Langkah 3: Perbarui state dengan file yang diubah ukurannya dan pratinjaunya
            setImage(resizedFile);
            const reader = new FileReader();
            reader.onloadend = () => {
                setPreview(reader.result as string);
            };
            reader.readAsDataURL(resizedFile);

        } catch (err: any) {
            console.error("Error memproses gambar:", err);
            setError(`Gagal memproses gambar: ${err.message}. Silakan coba gambar lain.`);
        } finally {
            // Hapus nilai input untuk memungkinkan pengunggahan ulang file yang sama
            e.target.value = '';
        }
    }
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
        
        const response = await fetch('/api/describe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imagePart }),
        });

        if (!response.ok) {
            const err = await response.json();
            const message = err.error || 'Gagal mendeskripsikan gambar.';
            if (response.status === 429) {
                throw new Error("429 RESOURCE_EXHAUSTED");
            }
            throw new Error(message);
        }

        const data = await response.json();
        if (data.description) {
          setPrompt(data.description);
        } else {
          setError("AI tidak dapat menghasilkan deskripsi untuk gambar ini.");
        }

    } catch (e: any) {
        console.error('Error in handleDescribe:', e);
        if (e.message && (e.message.includes('429') || e.message.toUpperCase().includes('RESOURCE_EXHAUSTED'))) {
            setError("Batas penggunaan AI tercapai. Silakan tunggu satu menit lalu coba lagi.");
        } else {
            setError(`Deskripsi gagal: ${e.message}`);
        }
    } finally {
        setIsDescribeLoading(false);
    }
  };
  
  const generateImage = async () => {
    const currentStyle = styles.find(s => s.name === activeStyle) || styles[0];
    const isSingleUploader = currentStyle.singleUploader;

    // Validasi
    if (isSingleUploader && !mainImage) {
        setError('Silakan unggah gambar utama.');
        return;
    }
    if (!isSingleUploader && (!mainImage || !styleImage)) {
        setError('Silakan unggah gambar utama dan gambar kedua untuk mode ini.');
        return;
    }

    setIsLoading(true);
    setGeneratedImage(null);
    setError('');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000); // Batas waktu 60 detik

    try {
        // Buat prompt akhir
        let finalPrompt = currentStyle.prompt.replace('{prompt}', prompt);

        // Tambahkan instruksi penguncian wajah jika diaktifkan
        if (isFaceLocked) {
            const lockFaceInstruction = "Critically important: Do not change the person's face or identity at all. The final result must be 100% identical to the original person's face. ";
            finalPrompt = lockFaceInstruction + finalPrompt;
        }

        // Siapkan bagian gambar
        const imageParts: Part[] = [];
        if (mainImage) imageParts.push(await fileToGenerativePart(mainImage));
        if (!isSingleUploader && styleImage) imageParts.push(await fileToGenerativePart(styleImage));

        // Panggilan API ke backend dengan sinyal abort
        const response = await fetch('/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: finalPrompt, imageParts }),
          signal: controller.signal,
        });

        if (!response.ok) {
            // Coba parsing sebagai JSON, jika gagal, gunakan teks
            let errorText = response.statusText;
            try {
                const err = await response.json();
                errorText = err.error || `Terjadi kesalahan: ${response.statusText}`;
            } catch (jsonError) {
                // Respons bukan JSON, kemungkinan besar dari server proxy/pembatas
                errorText = `Server mengembalikan respons yang tidak valid (status ${response.status}). Ini bisa terjadi jika file terlalu besar.`;
            }

            if (response.status === 429) {
                throw new Error("429 RESOURCE_EXHAUSTED");
            }
            throw new Error(errorText);
        }

        const imageData = await response.json();

        if (imageData && imageData.base64) {
            setGeneratedImage(`data:${imageData.mimeType};base64,${imageData.base64}`);
        } else {
            throw new Error("Respons API tidak valid dari server.");
        }

    } catch (e: any) {
        console.error('Error in generateImage:', e);
        if (e.name === 'AbortError') {
            setError("Pembuatan gagal: Permintaan memakan waktu terlalu lama (timeout). Ini mungkin karena beban server yang tinggi atau batasan platform hosting. Coba lagi nanti.");
        } else if (e.message && (e.message.includes('429') || e.message.toUpperCase().includes('RESOURCE_EXHAUSTED'))) {
            setError("Batas penggunaan AI tercapai. Ini biasa terjadi saat ada banyak permintaan. Silakan tunggu satu menit lalu coba lagi.");
        } else {
            setError(`Pembuatan gagal: ${e.message}`);
        }
        setGeneratedImage(null);
    } finally {
        clearTimeout(timeoutId);
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
  } else if (activeStyle === 'Pose Bersama') {
    mainUploaderLabel = 'Orang 1';
    styleUploaderLabel = 'Orang 2';
    blendHelperText = 'Unggah dua foto orang yang berbeda untuk digabungkan.';
  } else if (activeStyle === 'Selfie Bareng') {
    mainUploaderLabel = 'Orang 1';
    styleUploaderLabel = 'Orang 2';
    blendHelperText = 'Unggah dua foto orang berbeda untuk membuat selfie bersama.';
  }


  return (
    <>
        <header className="navbar">
            <div className="navbar-container">
                <h1>ImageAI IT PALUGADA</h1>
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
                            <p className="optimization-notice">Untuk performa terbaik, gambar akan dioptimalkan (maks 1024px).</p>
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
                            <p className="optimization-notice">Untuk performa terbaik, gambar akan dioptimalkan (maks 1024px).</p>
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
                            currentStyle.placeholder || // Gunakan placeholder khusus jika ada
                            (currentStyle.requiresPrompt 
                                ? `Jelaskan perubahan yang Anda inginkan...` // Fallback umum
                                : `Jelaskan visi Anda...`)
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
                            <div className="checkbox-container">
                                <input 
                                    type="checkbox" 
                                    id="lock-face" 
                                    checked={isFaceLocked}
                                    onChange={(e) => setIsFaceLocked(e.target.checked)}
                                />
                                <label htmlFor="lock-face">Lock Face (100%)</label>
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
                            <p className="loading-message">{loadingMessage}</p>
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