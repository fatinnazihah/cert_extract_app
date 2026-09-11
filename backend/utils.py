import os
import re
import json
import base64
import time
import tempfile
from urllib.parse import quote_plus
from dotenv import load_dotenv
from PIL import Image, ImageDraw, ImageOps
import qrcode
from pypdf import PdfReader, PdfWriter
import pypdfium2 as pdfium
import pytesseract
import firebase_admin
from firebase_admin import credentials, firestore, storage, initialize_app

load_dotenv()

# ==============================================================================
# 1. CLIENT INITIALIZATIONS & CONFIGURATION
# ==============================================================================
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

GROQ_MODELS = [
    "qwen/qwen3.8-27b",
    "qwen/qwen3.6-27b",
    "openai/gpt-oss-120b",
    "openai/gpt-oss-20b",
    "groq/compound"
]

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
            print(f"✅ Tesseract found: {path}")
            break

BASE_TEMP_DIR = tempfile.gettempdir()
QR_DIR = os.path.join(BASE_TEMP_DIR, "qrcodes")
SPLIT_DIR = os.path.join(BASE_TEMP_DIR, "temp_split_certs")

for directory in [QR_DIR, SPLIT_DIR]:
    os.makedirs(directory, mode=0o777, exist_ok=True)

EXTRACTION_PROMPT = """
You are an expert calibration and safety certificate extraction system.
Analyze the provided document/OCR text from a certificate page and extract all equipment/PPE records into structured JSON.

Extract the following exact fields according to these strict rules:

1. "serial": string
   - Equipment Serial Number, Tag No, Unit S/N, or Barcode (e.g., "224195", "9-573-26").

2. "model": string
   - Full Equipment / Brand / Model Description (e.g., "MSA ALTAIR 5X", "HONEYWELL BW RIGRAT", "CROWCON DETECTIVE+").

3. "cal": string
   - Calibration / Inspection / Issue Date formatted strictly as YYYY-MM-DD.

4. "exp": string
   - Expiry / Calibration Due Date formatted strictly as YYYY-MM-DD.

5. "cert": string
   - MANDATORY PRIORITY RULE: Look FIRST for the Certificate Number ending in ".SRV" (e.g., "6/00381/2026.SRV", "CHSB/CAL/2026/01.SRV").
   - If a number ending in ".SRV" exists, capture it and stop immediately after ".SRV".
   - ONLY IF NO number with ".SRV" exists on the document, capture the Report No / Certificate No (e.g., "CHSB-ES-26-32").
   - If neither exists, return an empty string "".

6. "lot": string
   - Lot No, Batch No, or Job No if present (otherwise empty string "").

7. "page": integer
   - The 1-indexed page integer provided.

8. "type": string
   - STRICT CATEGORY MAPPING RULES:
     * "AREA MONITOR": Assign ONLY if the model/description is specifically "CROWCON, DETECTIVE+" or "HONEYWELL, BW RIGRAT" (or variants like "Crowcon Detective+", "BW RigRat").
     * "GD": Portable multi-gas/single-gas detectors (e.g., "MSA Altair 4X/5X", "Honeywell MicroClip", "BW Max XT", "Ventis Pro").
     * "EEBD": Emergency Escape Breathing Apparatus.
     * "SCBA": Self-Contained Breathing Apparatus.
     * "HARNESS": Safety Harness / Full Body Harness.
     * "ABSORBER": Shock Absorbers / Lanyards.
     * "SMOKE HOOD": Emergency smoke escape hoods.
     * "RESCUE KIT": Rescue kits / retrieval blocks / tripods.
   - Must be one of: ["GD", "EEBD", "HARNESS", "ABSORBER", "SMOKE HOOD", "SCBA", "AREA MONITOR", "RESCUE KIT"].

Return a valid JSON object with the key "items" containing a list of objects.
If no equipment record is present on this page, return {"items": []}.
"""

# ==============================================================================
# 2. FIREBASE SETUP
# ==============================================================================
def get_firebase_db():
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
# 3. PDF & OCR UTILITIES
# ==============================================================================
def sanitize_filename(name):
    return re.sub(r'[\\/:"*?<>|]', "_", str(name)).strip()

def split_pdf_to_pages(original_path):
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
    """Layout-first extraction with Tesseract OCR fallback."""
    extracted_text = ""
    try:
        import pdfplumber
        with pdfplumber.open(file_path) as pdf:
            if page_idx < len(pdf.pages):
                extracted_text = (pdf.pages[page_idx].extract_text(layout=True) or "").strip()
    except Exception as e:
        print(f"⚠️ Layout extraction error on page {page_idx + 1}: {e}")

    if len(extracted_text) >= 30:
        return extracted_text

    print(f"🔍 Scanned page detected. Running OCR on Page {page_idx + 1}...")
    try:
        pdf = pdfium.PdfDocument(file_path)
        try:
            page = pdf.get_page(page_idx)
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
        print(f"⚠️ OCR failed on page {page_idx + 1}: {err}")

    return extracted_text

def clean_extracted_items(items, pages_list, file_path, is_service):
    cleaned_data = []
    for item in items:
        page_num = item.get("page", 1)
        item['local_split_path'] = next((p[0] for p in (pages_list or []) if p[1] == page_num), file_path)
        
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
    if not groq_client or model_index >= len(GROQ_MODELS):
        return []

    current_model = GROQ_MODELS[model_index]
    prompt = f"{EXTRACTION_PROMPT}\n\nOCR Scanned Text from Page {page_number}:\n\"\"\"\n{page_text}\n\"\"\""

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
        raw_output = re.sub(r'<think>.*?</think>', '', raw_output, flags=re.DOTALL).strip()
        if raw_output.startswith("```"):
            raw_output = re.sub(r"^```(?:json)?", "", raw_output).rstrip("`").strip()

        parsed = json.loads(raw_output)
        if isinstance(parsed, list):
            items = parsed
        elif isinstance(parsed, dict):
            items = parsed.get("items", parsed.get("data", parsed.get("records", [])))
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
            print(f"⚡ Processing Page {page_num}/{total_pages} for {os.path.basename(file_path)}...")
            ocr_text = ocr_extract_page(file_path, idx)
            if not ocr_text.strip():
                continue

            page_items = extract_single_page_text(ocr_text, page_num, model_index=0)
            for item in page_items:
                item["page"] = page_num
                all_items.append(item)

        cleaned_data = clean_extracted_items(all_items, pages_list, file_path, is_service)
        if cleaned_data:
            return {"status": "success", "data": cleaned_data}
    except Exception as e:
        print(f"❌ Extraction error on {file_path}: {e}")

    return {
        "status": "failed", 
        "error": "Extraction failed to find records. Please use manual entry.",
        "can_manual": True,
        "temp_files": [{"page": p[1], "path": p[0]} for p in pages_list]
    }

# ==============================================================================
# 5. STORAGE & FIRESTORE HELPERS
# ==============================================================================
def update_firestore_record(collection_name, serial, data, pdf_url, qr_url, qr_link):
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
    try:
        _, bucket = get_firebase_db()
        if not bucket:
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