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
from PIL import Image, ImageDraw, ImageFont
import qrcode
from pypdf import PdfReader, PdfWriter
import pdfplumber
import firebase_admin
from firebase_admin import credentials, firestore, storage, initialize_app, _apps

# Load environment configuration from .env
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

# Priority list of Groq models to cascade through if a model 404s or hits limits
GROQ_MODELS = [
    "qwen/qwen3.8-27b",
    "qwen/qwen3.6-27b",
    "openai/gpt-oss-120b",
    "openai/gpt-oss-20b",
    "groq/compound"
]

# Use cross-platform temp directory (resolves Windows /tmp path errors)
BASE_TEMP_DIR = tempfile.gettempdir()
QR_DIR = os.path.join(BASE_TEMP_DIR, "qrcodes")
SPLIT_DIR = os.path.join(BASE_TEMP_DIR, "temp_split_certs")

for directory in [QR_DIR, SPLIT_DIR]:
    os.makedirs(directory, mode=0o777, exist_ok=True)

# Schema extraction instructions for Groq
EXTRACTION_PROMPT = """
Analyze this safety certificate text. Identify every unique PPE or equipment item record.
Return a valid JSON object with a key "items" containing a list of objects with these exact keys:
- "serial": string (equipment serial number or ID)
- "model": string (full brand/model description)
- "cal": string (Inspection/Calibration Date in YYYY-MM-DD format)
- "exp": string (Expiry Date in YYYY-MM-DD format)
- "cert": string (Certificate No, stop after .SRV if present)
- "lot": string (Report or Lot Number if present, else empty string)
- "page": integer (1-indexed page number where this record appears)
- "type": string (HARNESS, ABSORBER, GD, EEBD, SCBA, or SMOKE HOOD)
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
# 3. PDF PROCESSING UTILITIES
# ==============================================================================
def sanitize_filename(name):
    """Sanitizes file names by removing illegal operating system characters."""
    return re.sub(r'[\\/:"*?<>|]', "_", str(name)).strip()

def split_pdf_to_pages(original_path):
    """Physically extracts each page from a PDF so each database entry gets its own file."""
    page_paths = []
    try:
        reader = PdfReader(original_path)
        for i, page in enumerate(reader.pages):
            output_filename = f"split_p{i + 1}_{int(time.time() * 1000)}.pdf"
            output_path = os.path.join(SPLIT_DIR, output_filename)
            writer = PdfWriter()
            writer.add_page(page)
            with open(output_path, "wb") as f:
                writer.write(f)
            page_paths.append((output_path, i + 1))
        return page_paths
    except Exception as e:
        print(f"❌ PDF Split Error: {e}")
        return []

def extract_raw_text_from_pdf(file_path):
    """Extracts raw text content across all pages for high-speed Groq LLM parsing."""
    combined_text = []
    try:
        with pdfplumber.open(file_path) as pdf:
            for idx, page in enumerate(pdf.pages):
                text = page.extract_text() or ""
                combined_text.append(f"--- START OF PAGE {idx + 1} ---\n{text}\n--- END OF PAGE {idx + 1} ---")
        return "\n\n".join(combined_text)
    except Exception as e:
        print(f"❌ PDF Text Extraction Error: {e}")
        return ""

def clean_extracted_items(items, pages_list, file_path, is_service):
    """Normalizes field values, collections, and page file links across all extracted items."""
    cleaned_data = []
    for item in items:
        # Match the extracted data to its split single-page PDF
        page_num = item.get("page", 1)
        item['local_split_path'] = next((p[0] for p in (pages_list or []) if p[1] == page_num), file_path)
        
        # Stop certificate string after .SRV if present
        if item.get("cert") and ".SRV" in str(item["cert"]):
            item["cert"] = str(item["cert"]).split(".SRV")[0] + ".SRV"
            
        b_type = str(item.get("type", "PPE")).upper().replace("_", " ")
        item["target_collection"] = b_type + ("_SERVICE" if is_service else "")
        cleaned_data.append(item)
    return cleaned_data

# ==============================================================================
# 4. GROQ-ONLY EXTRACTION ENGINE
# ==============================================================================
def extract_with_groq_cascade(raw_text, pages_list, file_path, is_service, model_index=0):
    """Cascades through Groq models and safely cleans LLM JSON responses."""
    if not groq_client:
        raise ValueError("Groq client not initialized.")
    
    if model_index >= len(GROQ_MODELS):
        raise ValueError("All Groq models exhausted.")

    current_model = GROQ_MODELS[model_index]
    print(f"⚡ --- Attempting Extraction with: Groq ({current_model}) ---")

    try:
        messages = [
            {"role": "system", "content": "You are a data extraction assistant. Return pure raw JSON without formatting, markdown, or commentary."},
            {"role": "user", "content": f"{EXTRACTION_PROMPT}\n\nDocument text content:\n{raw_text}"}
        ]

        chat_completion = groq_client.chat.completions.create(
            messages=messages,
            model=current_model,
            response_format={"type": "json_object"}
        )

        raw_output = chat_completion.choices[0].message.content.strip()

        # Remove <think>...</think> tags if present in Qwen output
        raw_output = re.sub(r'<think>.*?</think>', '', raw_output, flags=re.DOTALL).strip()

        # Strip markdown ```json code fences if present
        if raw_output.startswith("```"):
            raw_output = re.sub(r"^```(?:json)?", "", raw_output).rstrip("`").strip()

        parsed = json.loads(raw_output)
        
        if isinstance(parsed, list):
            items = parsed
        elif isinstance(parsed, dict):
            items = parsed.get("items", parsed.get("data", [parsed]))
        else:
            items = []

        return clean_extracted_items(items, pages_list, file_path, is_service)

    except Exception as e:
        print(f"⚠️ Groq model '{current_model}' parse/exec failed: {e}. Trying next model...")
        return extract_with_groq_cascade(raw_text, pages_list, file_path, is_service, model_index + 1)

def process_pdf_text(file_path, is_service=False, manual_type=None):
    """Master workflow: Extracts text from PDF and parses via Groq cascade."""
    pages_list = split_pdf_to_pages(file_path)
    
    if not groq_client:
        return {
            "status": "failed", 
            "error": "GROQ_API_KEY is missing or invalid. Please check your .env file.",
            "can_manual": True,
            "temp_files": [{"page": p[1], "path": p[0]} for p in pages_list]
        }

    try:
        raw_text = extract_raw_text_from_pdf(file_path)
        if not raw_text.strip():
            print("⚠️ PDF contains no extractable text. Please ensure the PDF has readable text layers.")
            return {
                "status": "failed",
                "error": "PDF has no extractable text stream (scanned image).",
                "can_manual": True,
                "temp_files": [{"page": p[1], "path": p[0]} for p in pages_list]
            }

        cleaned_data = extract_with_groq_cascade(raw_text, pages_list, file_path, is_service, model_index=0)
        if cleaned_data:
            return {"status": "success", "data": cleaned_data}

    except Exception as e:
        print(f"❌ Groq extraction failed completely: {e}")

    # Fallback to Manual Entry Data Prep
    return {
        "status": "failed", 
        "error": "Extraction failed across all Groq models. Please use manual entry.",
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