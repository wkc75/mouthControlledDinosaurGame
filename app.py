import os
import tempfile

from dotenv import load_dotenv
from flask import Flask, jsonify, render_template, request
from inference_sdk import InferenceHTTPClient

load_dotenv()

app = Flask(__name__)


def get_roboflow_settings():
    return {
        "api_key": os.getenv("ROBOFLOW_API_KEY", "").strip(),
        "model_id": os.getenv("ROBOFLOW_MODEL_ID", "").strip(),
        "open_label": os.getenv("OPEN_LABEL", "mouth_open").strip().lower(),
        "open_threshold": float(os.getenv("OPEN_THRESHOLD", "0.75")),
    }


@app.get("/")
def index():
    return render_template("index.html")


@app.post("/predict")
def predict():
    frame = request.files.get("frame")
    if frame is None:
        return jsonify({"error": "No frame uploaded."}), 400

    settings = get_roboflow_settings()
    if not settings["api_key"] or not settings["model_id"]:
        return jsonify(
            {
                "error": (
                    "Roboflow is not configured. Set ROBOFLOW_API_KEY and "
                    "ROBOFLOW_MODEL_ID in .env."
                )
            }
        ), 503

    temp_path = None

    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".jpg") as temp_file:
            frame.save(temp_file.name)
            temp_path = temp_file.name

        client = InferenceHTTPClient(
            api_url="https://serverless.roboflow.com",
            api_key=settings["api_key"],
        )
        result = client.infer(temp_path, model_id=settings["model_id"])

        top_label = str(result.get("top", "")).strip()
        confidence = float(result.get("confidence", 0))
        mouth_open = (
            top_label.lower() == settings["open_label"]
            and confidence >= settings["open_threshold"]
        )

        return jsonify(
            {
                "label": top_label,
                "confidence": confidence,
                "mouthOpen": mouth_open,
                "threshold": settings["open_threshold"],
            }
        )
    except Exception as exc:
        return jsonify({"error": f"Inference failed: {exc}"}), 502
    finally:
        if temp_path and os.path.exists(temp_path):
            os.remove(temp_path)


if __name__ == "__main__":
    app.run(debug=True)
