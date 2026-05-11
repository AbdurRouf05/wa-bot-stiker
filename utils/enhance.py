import cv2
import sys
import os

def enhance_image(input_path, output_path):
    # Load image
    img = cv2.imread(input_path)
    if img is None:
        print("Error: Could not read image")
        return

    # Initialize Super Resolution object
    sr = cv2.dnn_superres.DnnSuperResImpl_create()

    # Path ke model (kita gunakan FSRCNN karena sangat ringan)
    # Anda perlu mendownload file model ini (FSRCNN_x3.pb)
    model_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "models", "FSRCNN_x3.pb")
    
    if not os.path.exists(model_path):
        # Jika model tidak ada, kita gunakan cara alternatif (Sharpening manual)
        # agar tidak error total
        print("Warning: AI Model not found, using manual sharpening.")
        # Gaussian Sharpening
        gaussian_3 = cv2.GaussianBlur(img, (0, 0), 2.0)
        unsharp_image = cv2.addWeighted(img, 2.0, gaussian_3, -1.0, 0)
        cv2.imwrite(output_path, unsharp_image)
        return

    try:
        sr.readModel(model_path)
        sr.setModel("fsrcnn", 3) # scale factor 3x
        
        # Upscale
        result = sr.upsample(img)
        
        # Simpan hasil
        cv2.imwrite(output_path, result)
        print("Success")
    except Exception as e:
        print(f"Error: {str(e)}")

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python enhance.py input.jpg output.jpg")
    else:
        enhance_image(sys.argv[1], sys.argv[2])
