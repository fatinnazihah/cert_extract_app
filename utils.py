import os
import re
import json
import base64
import time
import io
import tempfile
from datetime import datetime
from urllib.parse import quote_plus
from dotenv import load_dotenv
from PIL import Image, ImageDraw, ImageFont, ImageOps
import qrcode
from pypdf import PdfReader, PdfWriter
import pypdfium2 as pdfium
import pytesseract
import firebase_admin
from firebase_admin import credentials, firestore, storage, initialize_app, _apps

# Load environment variables from .env
load_dotenv()

# ==============================================================================
# 1. CLIENT INITIALIZATIONS & CONFIGURATION
# ==============================================================================
# Groq client initialization (Sole Extraction Engine)
groq_client = None
GROQ_KEY = os.getenv("GROQ_API_KEY")
if GROQ_KEY:
    try:
        from groq import Groq
        groq_client = Groq(api_key=GROQ_KEY.strip())
        print("✅ Groq client initialized successfully.")
    except ImportError:
        print("⚠️ Groq package not installed. Run: pip install groq")
else:
    print("⚠️ GROQ_API_KEY is not defined in .env")

# Priority list of Groq models to cascade through if a model hits rate limits
GROQ_MODELS = [
    "qwen/qwen3.8-27b",
    "qwen/qwen3.6-27b",
    "openai/gpt-oss-120b",
    "openai/gpt-oss-20b",
    "groq/compound"
]

# Auto-detect Tesseract binary on Windows
if os.name == 'nt':
    possible_tesseract_paths = [
        r"C:\Program Files\Tesseract-OCR\tesseract.exe",
        r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe",
        os.path.expandvars(r"%LOCALAPPDATA%\Programs\Tesseract-OCR\tesseract.exe"),
        os.path.expandvars(r"%USERPROFILE%\AppData\Local\Programs\Tesseract-OCR\tesseract.exe")
    ]
    for path in possible_tesseract_paths:
        if os.path.exists(path):
            pytesseract.pytesseract.tesseract_cmd = path
            print(f"✅ Tesseract executable found: {path}")
            break

# Temporary storage paths
BASE_TEMP_DIR = tempfile.gettempdir()
QR_DIR = os.path.join(BASE_TEMP_DIR, "qrcodes")
SPLIT_DIR = os.path.join(BASE_TEMP_DIR, "temp_split_certs")

for directory in [QR_DIR, SPLIT_DIR]:
    os.makedirs(directory, mode=0o777, exist_ok=True)

# Extraction prompt specifically tuned for OCR certificate parsing
EXTRACTION_PROMPT = """
You are an expert calibration and safety certificate extraction system.
Analyze the provided OCR scanned text from a certificate page and extract all equipment/PPE records.

Extract the following exact fields:
- "serial": Equipment Serial Number, Tag No, Unit S/N, or ID (e.g., "224195", "9-573-26").
- "model": Full Equipment / Model Name / Description (e.g., "MSA Altair 5X", "Honeywell MicroClip", "Harness").
- "cal": Inspection / Calibration Date in YYYY-MM-DD format.
- "exp": Expiry / Due Date in YYYY-MM-DD format.
- "cert": Certificate Number / Report No (stop after .SRV if present).
- "lot": Lot No, Batch No, or Job No if present (otherwise empty string "").
- "page": The page number integer provided.
- "type": Category name (Choose closest from: GD, EEBD, HARNESS, ABSORBER, SMOKE HOOD, SCBA, AREA MONITOR, RESCUE KIT).

Return a valid JSON object with the key "items" containing a list of objects.
Example:
{
  "items": [
    {
      "serial": "224195",
      "model": "MSA Altair 5X Gas Detector",
      "cal": "2026-06-05",
      "exp": "2026-12-02",
      "cert": "CHSB/CAL/2026/01.SRV",
      "lot": "",
      "page": 1,
      "type": "GD"
    }
  ]
}
If no equipment record is present on this page, return {"items": []}.
"""

# ==============================================================================
# 2. FIREBASE SETUP
# ==============================================================================
def get_firebase_db():
    """Initializes and returns the Firestore client and Storage bucket."""
    FIREBASE_BUCKET_NAME = os.getenv("FIREBASE_BUCKET")
    FIREBASE_CREDENTIALS = os.getenv("FIREBASE_CREDENTIALS")

    if not firebase_admin._apps:
        try:
            cred = None
            if FIREBASE_CREDENTIALS:
                firebase_dict = json.loads(base64.b64decode(FIREBASE_CREDENTIALS.strip()).decode("utf-8"))
                cred = credentials.Certificate(firebase_dict)
            elif os.path.exists("serviceAccountKey.json"):
                cred = credentials.Certificate("serviceAccountKey.json")
            else:
                raise ValueError("No Firebase credentials provided in .env or serviceAccountKey.json.")

            initialize_app(cred, {'storageBucket': FIREBASE_BUCKET_NAME.strip()} if FIREBASE_BUCKET_NAME else None)
        except Exception as e:
            print(f"❌ Firebase Init Error: {e}")
            raise e
            
    return firestore.client(), storage.bucket() if FIREBASE_BUCKET_NAME else None

# ==============================================================================
# 3. PDF & TESSERACT OCR UTILITIES
# ==============================================================================
def sanitize_filename(name):
    """Sanitizes file names by removing illegal operating system characters."""
    return re.sub(r'[\\/:"*?<>|]', "_", str(name)).strip()

def split_pdf_to_pages(original_path):
    """Physically extracts each page from a PDF into a standalone PDF file."""
    page_paths = []
    try:
        with open(original_path, "rb") as f:
            reader = PdfReader(f)
            total_pages = len(reader.pages)
            for i in range(total_pages):
                output_filename = f"split_p{i + 1}_{int(time.time() * 1000)}.pdf"
                output_path = os.path.join(SPLIT_DIR, output_filename)
                writer = PdfWriter()
                writer.add_page(reader.pages[i])
                with open(output_path, "wb") as out_f:
                    writer.write(out_f)
                page_paths.append((output_path, i + 1))
        return page_paths
    except Exception as e:
        print(f"❌ PDF Split Error: {e}")
        return []

def ocr_extract_page(file_path, page_idx):
    """
    Fast extraction pipeline:
    1. Digital Text First (Instant, 0.02s): Uses pdfplumber layout mode.
    2. OCR Fallback (Only for scanned PDFs): If digital text is missing/sparse (<30 chars),
       renders at 180 DPI and runs Tesseract.
    """
    extracted_text = ""

    # STEP 1: Fast native layout extraction (Instant)
    try:
        import pdfplumber
        with pdfplumber.open(file_path) as pdf:
            if page_idx < len(pdf.pages):
                extracted_text = (pdf.pages[page_idx].extract_text(layout=True) or "").strip()
    except Exception as e:
        print(f"⚠️ Native text extraction error on page {page_idx + 1}: {e}")

    # If digital text exists, return immediately without touching CPU-heavy OCR
    if len(extracted_text) >= 30:
        return extracted_text

    # STEP 2: Only run OCR if page is a scanned image (text < 30 chars)
    print(f"🔍 Scanned page detected (text sparse). Running Tesseract OCR on Page {page_idx + 1}...")
    try:
        pdf = pdfium.PdfDocument(file_path)
        try:
            page = pdf.get_page(page_idx)
            # Render at 180 DPI (scale ≈ 2.5) instead of 300 DPI for 3x faster OCR speed on 0.1 CPU
            bitmap = page.render(scale=180 / 72)
            pil_image = bitmap.to_pil()
        finally:
            pdf.close()

        gray = pil_image.convert("L")
        enhanced = ImageOps.autocontrast(gray, cutoff=2)
        ocr_text = pytesseract.image_to_string(enhanced, config=r"--oem 3 --psm 6").strip()

        if len(ocr_text) > len(extracted_text):
            extracted_text = ocr_text

    except Exception as err:
        print(f"⚠️ OCR processing failed on page {page_idx + 1}: {err}")

    return extracted_text

def clean_extracted_items(items, pages_list, file_path, is_service):
    """Normalizes field values, target collections, and single-page file links."""
    cleaned_data = []
    for item in items:
        page_num = item.get("page", 1)
        item['local_split_path'] = next((p[0] for p in (pages_list or []) if p[1] == page_num), file_path)
        
        # Strip trailing text after .SRV
        if item.get("cert") and ".SRV" in str(item["cert"]):
            item["cert"] = str(item["cert"]).split(".SRV")[0] + ".SRV"
            
        b_type = str(item.get("type", "PPE")).upper().replace("_", " ")
        item["target_collection"] = b_type + ("_SERVICE" if is_service else "")
        cleaned_data.append(item)
    return cleaned_data

# ==============================================================================
# 4. GROQ EXTRACTION ENGINE
# ==============================================================================
def extract_single_page_text(page_text, page_number, model_index=0):
    """Sends OCR scanned text to Groq for structured JSON mapping."""
    if not groq_client or model_index >= len(GROQ_MODELS):
        return []

    current_model = GROQ_MODELS[model_index]
    
    prompt = f"""
{EXTRACTION_PROMPT}

OCR Scanned Text from Page {page_number}:
\"\"\"
{page_text}
\"\"\"
"""

    try:
        chat_completion = groq_client.chat.completions.create(
            messages=[
                {"role": "system", "content": "You are a professional industrial certificate parsing system. You extract equipment metadata and return pure valid JSON only."},
                {"role": "user", "content": prompt}
            ],
            model=current_model,
            max_tokens=750,
            response_format={"type": "json_object"}
        )

        raw_output = chat_completion.choices[0].message.content.strip()
        
        # Clean reasoning/thought blocks and markdown formatting
        raw_output = re.sub(r'<think>.*?</think>', '', raw_output, flags=re.DOTALL).strip()
        if raw_output.startswith("```"):
            raw_output = re.sub(r"^```(?:json)?", "", raw_output).rstrip("`").strip()

        parsed = json.loads(raw_output)
        
        if isinstance(parsed, list):
            items = parsed
        elif isinstance(parsed, dict):
            items = parsed.get("items", parsed.get("data", parsed.get("records", [])))
            # If the model returned a single object as the root dictionary
            if not items and ("serial" in parsed or "model" in parsed):
                items = [parsed]
        else:
            items = []

        print(f"✅ Extracted {len(items)} record(s) from Page {page_number} via {current_model}.")
        return items

    except Exception as e:
        print(f"⚠️ Page {page_number} failed on '{current_model}': {e}. Retrying next model...")
        return extract_single_page_text(page_text, page_number, model_index + 1)

def process_pdf_text(file_path, is_service=False, manual_type=None):
    """
    Master workflow:
    1. Splits PDF into standalone page files
    2. Runs Tesseract OCR on every page
    3. Sends OCR text to Groq for structured JSON parsing
    4. Aggregates and returns all extracted records
    """
    pages_list = split_pdf_to_pages(file_path)
    
    if not groq_client:
        return {
            "status": "failed", 
            "error": "GROQ_API_KEY is missing or not configured in .env.",
            "can_manual": True,
            "temp_files": [{"page": p[1], "path": p[0]} for p in pages_list]
        }

    try:
        all_items = []
        with open(file_path, "rb") as f:
            reader = PdfReader(f)
            total_pages = len(reader.pages)

        for idx in range(total_pages):
            page_num = idx + 1
            print(f"⚡ Running Tesseract OCR on Page {page_num}/{total_pages} for {os.path.basename(file_path)}...")
            
            ocr_text = ocr_extract_page(file_path, idx)
            if not ocr_text.strip():
                print(f"⚠️ Page {page_num} OCR returned no text.")
                continue

            print(f"📄 Page {page_num} OCR Sample: {ocr_text[:120].replace(chr(10), ' ')}...")
            page_items = extract_single_page_text(ocr_text, page_num, model_index=0)
            
            for item in page_items:
                item["page"] = page_num
                all_items.append(item)

        cleaned_data = clean_extracted_items(all_items, pages_list, file_path, is_service)
        if cleaned_data:
            return {"status": "success", "data": cleaned_data}
        else:
            print("⚠️ No structured records found in OCR output.")

    except Exception as e:
        print(f"❌ Extraction error on {file_path}: {e}")

    return {
        "status": "failed", 
        "error": "Extraction failed to find records. Please use manual entry.",
        "can_manual": True,
        "temp_files": [{"page": p[1], "path": p[0]} for p in pages_list]
    }

# ==============================================================================
# 5. FIREBASE STORAGE & RECORD PERSISTENCE
# ==============================================================================
def update_firestore_record(collection_name, serial, data, pdf_url, qr_url, qr_link):
    """Saves or updates a certificate document in the specified Firestore collection."""
    try:
        db, _ = get_firebase_db()
        if not db:
            return False
        
        doc_id = sanitize_filename(serial)
        doc_ref = db.collection(collection_name).document(doc_id)
        
        doc_data = {
            "serial": serial,
            "cert": data.get("cert", ""),
            "model": data.get("model", ""),
            "calibration_date": data.get("cal", ""),
            "expiry_date": data.get("exp", ""),
            "lot": data.get("lot", ""),
            "pdf_url": pdf_url,
            "qr_image_url": qr_url,
            "qr_link": qr_link,
            "last_updated": firestore.SERVER_TIMESTAMP,
            "source_page": data.get("page", 1)
        }
        
        doc_ref.set(doc_data, merge=True)
        return True
    except Exception as e:
        print(f"❌ Firestore Error: {e}")
        return False

def generate_qr_image_only(serial, link):
    """Generates a high-res QR code image with the serial number caption."""
    safe_serial = sanitize_filename(serial)
    qr = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_H, box_size=10, border=4)
    qr.add_data(link)
    qr.make(fit=True)
    qr_img = qr.make_image(fill_color="black", back_color="white").convert("RGBA")
    
    final = Image.new("RGBA", (500, 600), "white")
    final.paste(qr_img.resize((500, 500)), (0, 0))
    ImageDraw.Draw(final).text((20, 530), f"SN: {serial}", fill="black")
    
    path = os.path.join(QR_DIR, f"qr_{safe_serial}.png")
    final.convert("RGB").save(path)
    return path

def upload_to_firebase_storage(local_path, serial, is_qr=False):
    """Uploads single page cert or QR code image to Firebase Storage and makes it public."""
    try:
        _, bucket = get_firebase_db()
        if not bucket:
            print("⚠️ Storage bucket not initialized.")
            return None

        safe_serial = sanitize_filename(serial)
        blob_name = f"qr_codes/qr_{safe_serial}.png" if is_qr else f"certificates/{safe_serial}_{int(time.time())}.pdf"
        blob = bucket.blob(blob_name)
        blob.upload_from_filename(local_path)
        blob.make_public()
        return blob.public_url
    except Exception as e:
        print(f"❌ Upload Error: {e}")
        return None