import os
import shutil
import time
from urllib.parse import quote_plus, unquote
from dotenv import load_dotenv
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

load_dotenv()
import utils

# --- SETUP ---
os.makedirs("static", exist_ok=True)
os.makedirs("temp_pdfs", exist_ok=True)

app = FastAPI(title="CHSB Cert Extractor API")

app.mount("/static", StaticFiles(directory="static"), name="static")

# Enable CORS for React frontend (Vite local dev + Production domains)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "https://qrcertificates-30ddb.web.app",
        "*"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- READ: LIST ALL COLLECTIONS ---
@app.get("/api/collections")
def list_collections():
    base = ["GD", "EEBD", "HARNESS", "ABSORBER", "SMOKE HOOD", "SCBA", "AREA MONITOR", "RESCUE KIT"]
    return {
        "collections": [c for b in base for c in (b, f"{b}_SERVICE")]
    }

# --- READ: GET ALL RECORDS IN COLLECTION ---
@app.get("/api/collection/{name}")
def get_collection_data(name: str):
    try:
        db, _ = utils.get_firebase_db()
        docs = db.collection(name).stream()

        data = []
        for doc in docs:
            d = doc.to_dict()
            d["id"] = doc.id
            d["collection"] = name
            if d.get("last_updated"):
                try:
                    d["last_updated"] = d["last_updated"].isoformat()
                except Exception:
                    d["last_updated"] = str(d["last_updated"])
            data.append(d)

        return {"data": data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch collection {name}: {str(e)}")

# --- DELETE: DELETE SINGLE RECORD ---
@app.delete("/api/collection/{col}/{doc_id}")
def delete_collection_item(col: str, doc_id: str):
    try:
        db, _ = utils.get_firebase_db()
        safe_id = utils.sanitize_filename(unquote(doc_id))
        doc_ref = db.collection(col).document(safe_id)
        
        # Check if exists before delete
        if not doc_ref.get().exists:
            # Try raw doc_id if sanitized didn't match
            doc_ref = db.collection(col).document(unquote(doc_id))

        doc_ref.delete()
        return {"status": "success", "deleted": doc_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete {doc_id} from {col}: {str(e)}")

# --- SEARCH ---
@app.get("/api/search")
def search_all(q: str):
    db, _ = utils.get_firebase_db()
    q = q.strip()
    base = ["GD", "EEBD", "HARNESS", "ABSORBER", "SMOKE HOOD", "SCBA", "AREA MONITOR", "RESCUE KIT"]
    collections = base + [f"{b}_SERVICE" for b in base]
    results = []
    safe_q = utils.sanitize_filename(q)

    for col in collections:
        doc = db.collection(col).document(safe_q).get()
        if doc.exists:
            d = doc.to_dict()
            d["id"] = doc.id
            d["collection"] = col
            results.append(d)
            continue

        for doc in db.collection(col).where("serial", "==", q).stream():
            d = doc.to_dict()
            d["id"] = doc.id
            d["collection"] = col
            results.append(d)

    return {"results": results}

# --- UPDATE: EDIT EXISTING RECORD ---
@app.post("/api/update_record")
async def update_record(
    collection: str = Form(...),
    serial: str = Form(...),
    model: str = Form(""),
    cal: str = Form(""),
    exp: str = Form(""),
    cert: str = Form(""),
    lot: str = Form("")
):
    try:
        db, _ = utils.get_firebase_db()
        safe_id = utils.sanitize_filename(serial)
        doc_ref = db.collection(collection).document(safe_id)

        update_payload = {
            "model": model,
            "calibration_date": cal,
            "expiry_date": exp,
            "cert": cert,
            "lot": lot,
            "last_updated": utils.firestore.SERVER_TIMESTAMP
        }

        # Use set with merge=True so missing documents are safely upserted
        doc_ref.set(update_payload, merge=True)
        return {"status": "success", "updated": serial}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update record: {str(e)}")

# --- EXTRACT ---
@app.post("/extract")
async def extract_pdf(
    file: UploadFile = File(...),
    is_service: str = Form("false")
):
    temp_path = f"temp_pdfs/{file.filename}"
    try:
        with open(temp_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        return utils.process_pdf_text(
            temp_path,
            is_service=is_service.lower() == "true"
        )
    finally:
        if os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except PermissionError:
                time.sleep(0.1)
                try:
                    os.remove(temp_path)
                except Exception:
                    pass

# --- CREATE: SAVE NEW RECORD ---
@app.post("/save")
async def save_record(
    file: UploadFile = File(...),
    serial: str = Form(...),
    model: str = Form(""),
    cal: str = Form(""),
    exp: str = Form(""),
    cert: str = Form(""),
    lot: str = Form(""),
    collection: str = Form(...)
):
    temp_path = f"temp_pdfs/{file.filename}"
    try:
        with open(temp_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        pdf_url = utils.upload_to_firebase_storage(temp_path, serial, is_qr=False)
        qr_link = f"https://qrcertificates-30ddb.web.app/?id={quote_plus(serial)}"
        qr_path = utils.generate_qr_image_only(serial, qr_link)
        qr_image_url = utils.upload_to_firebase_storage(qr_path, serial, is_qr=True)

        utils.update_firestore_record(
            collection,
            serial,
            {
                "model": model,
                "cal": cal,
                "exp": exp,
                "cert": cert,
                "lot": lot
            },
            pdf_url,
            qr_image_url,
            qr_link
        )

        return {
            "status": "success",
            "web_link": qr_link,
            "pdf_url": pdf_url,
            "qr_image_url": qr_image_url
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except PermissionError:
                time.sleep(0.1)
                try:
                    os.remove(temp_path)
                except Exception:
                    pass

# -- Health Check Endpoint ---
@app.get("/health")
def health_check():
    return {"status": "ok"}