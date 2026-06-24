import http.server
import socketserver
import json
import urllib.parse
import urllib.request
import os

PORT = 8080
DIRECTORY = os.path.dirname(os.path.abspath(__file__))
HISTORY_FILE = os.path.join(DIRECTORY, "mock_history.json")

# Initialize mock history file if not exists
if not os.path.exists(HISTORY_FILE):
    with open(HISTORY_FILE, "w", encoding="utf-8") as f:
        json.dump([
            {
                "user_id": 1,
                "recorded_at": "2026-06-01 09:00:00",
                "gender": "Nam",
                "height": 170.0,
                "weight": 70.0,
                "bmi": 24.2,
                "blood_pressure_systolic": 130,
                "blood_pressure_diastolic": 85,
                "blood_glucose": 5.8,
                "liver_ast": 42,
                "liver_alt": 45,
                "kidney_creatinine": 95.0,
                "kidney_urea": 6.5,
                "cholesterol": 5.4,
                "triglycerides": 1.9,
                "uric_acid": 430.0
            },
            {
                "user_id": 1,
                "recorded_at": "2026-06-15 09:00:00",
                "gender": "Nam",
                "height": 170.0,
                "weight": 68.5,
                "bmi": 23.7,
                "blood_pressure_systolic": 125,
                "blood_pressure_diastolic": 82,
                "blood_glucose": 5.5,
                "liver_ast": 38,
                "liver_alt": 39,
                "kidney_creatinine": 90.0,
                "kidney_urea": 6.0,
                "cholesterol": 5.1,
                "triglycerides": 1.6,
                "uric_acid": 410.0
            }
        ], f, indent=4)

class TrivynaLocalHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def do_GET(self):
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path
        query = urllib.parse.parse_qs(parsed_url.query)

        # Intercept PHP API endpoints for local mock support
        if "trivyna-health.php" in path:
            action = query.get("action", [None])[0]
            self.handle_php_action(action, query)
        else:
            # Fallback to serving static files
            super().do_GET()

    def do_POST(self):
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path
        query = urllib.parse.parse_qs(parsed_url.query)

        if "trivyna-health.php" in path:
            action = query.get("action", [None])[0]
            self.handle_php_action(action, query)
        else:
            self.send_error(404, "File not found")

    def handle_php_action(self, action, query):
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.end_headers()

        if action == "check_auth":
            response = {
                "logged_in": True,
                "user_id": 1,
                "is_wordpress": False,
                "message": "Mock login (Local Standalone Server)"
            }
            self.wfile.write(json.dumps(response).encode("utf-8"))

        elif action == "get_history":
            try:
                with open(HISTORY_FILE, "r", encoding="utf-8") as f:
                    history = json.load(f)
            except Exception:
                history = []
            response = {"success": True, "data": history}
            self.wfile.write(json.dumps(response).encode("utf-8"))

        elif action == "save_record":
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            record_data = json.loads(post_data.decode("utf-8"))
            
            # Format to DB style
            import datetime
            new_record = {
                "user_id": 1,
                "recorded_at": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                "gender": record_data.get("gender", "Nam"),
                "height": float(record_data.get("height", 0)),
                "weight": float(record_data.get("weight", 0)),
                "bmi": float(record_data.get("bmi", 0)),
                "blood_pressure_systolic": int(record_data.get("bp_systolic", 0)),
                "blood_pressure_diastolic": int(record_data.get("bp_diastolic", 0)),
                "blood_glucose": float(record_data.get("glucose", 0)),
                "liver_ast": int(record_data.get("ast", 0)),
                "liver_alt": int(record_data.get("alt", 0)),
                "kidney_creatinine": float(record_data.get("creatinine", 0)),
                "kidney_urea": float(record_data.get("urea", 0)),
                "cholesterol": float(record_data.get("cholesterol", 0)),
                "triglycerides": float(record_data.get("triglycerides", 0)),
                "uric_acid": float(record_data.get("uric_acid", 0))
            }
            
            try:
                with open(HISTORY_FILE, "r", encoding="utf-8") as f:
                    history = json.load(f)
            except Exception:
                history = []
                
            history.append(new_record)
            
            with open(HISTORY_FILE, "w", encoding="utf-8") as f:
                json.dump(history, f, indent=4)
                
            self.wfile.write(json.dumps({"success": True, "message": "Saved locally"}).encode("utf-8"))

        elif action == "call_gemini":
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            raw_data = json.loads(post_data.decode("utf-8"))
            
            api_key = raw_data.get("api_key", "")
            if not api_key:
                # Mock fallback if user doesn't enter an API Key
                mock_ai_resp = {
                    "candidates": [{
                        "content": {
                            "parts": [{
                                "text": "[ĐÁNH GIÁ SỨC KHỎE]\nThể trạng của bạn đang được kiểm soát khá ổn định. Cân nặng của bạn đã giảm nhẹ so với đợt đo trước (giảm 1.5kg). Tuy nhiên, chỉ số cholesterol và huyết áp đang ở mức cảnh báo nhẹ, cần chú ý chế độ ăn uống.\n\n[THỰC ĐƠN EAT CLEAN KHUYẾN NGHỊ]\n- Sáng: 1 bát cháo yến mạch ức gà xé phay (150g gà), 1 cốc nước ấm.\n- Trưa: 150g cá quả hấp hành thì là, 1 bát cơm lứt nhỏ (100g), rau cải ngọt luộc.\n- Phụ chiều: 1 quả táo nhỏ hoặc 5-7 hạt hạnh nhân.\n- Tối: 100g đậu hũ sốt cà chua lạt, 1 bát súp rau củ thập cẩm, hạn chế gia vị mặn.\n\n[CHẾ ĐỘ TẬP LUYỆN]\n- Hãy tập đi bộ nhanh hoặc đạp xe nhẹ nhàng 30-45 phút mỗi ngày.\n- Kết hợp 2 buổi tập Yoga/Pilates giãn cơ mỗi tuần để cải thiện hệ tim mạch."
                            }]
                        }
                    }]
                }
                self.wfile.write(json.dumps(mock_ai_resp).encode("utf-8"))
                return

            # Proxy to actual Google Gemini API
            url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={api_key}"
            req_type = raw_data.get("type", "analysis")
            
            request_body = {}
            if req_type == "vision":
                image_base64 = raw_data.get("image_base64", "")
                if "," in image_base64:
                    image_base64 = image_base64.split(",")[1]
                prompt = raw_data.get("prompt", "")
                request_body = {
                    "contents": [{
                        "parts": [
                            {"text": prompt},
                            {"inlineData": {"mimeType": "image/jpeg", "data": image_base64}}
                        ]
                    }]
                }
            else:
                prompt = raw_data.get("prompt", "")
                request_body = {
                    "contents": [{
                        "parts": [{"text": prompt}]
                    }]
                }

            req = urllib.request.Request(
                url,
                data=json.dumps(request_body).encode("utf-8"),
                headers={"Content-Type": "application/json"},
                method="POST"
            )
            try:
                with urllib.request.urlopen(req, timeout=15) as response:
                    res_data = response.read()
                    self.wfile.write(res_data)
            except Exception as e:
                self.wfile.write(json.dumps({"success": False, "message": str(e)}).encode("utf-8"))

print(f"Starting local server at http://localhost:{PORT}")
print(f"Serving files from: {DIRECTORY}")
print("Mock database file initialized.")
print("Press Ctrl+C to stop.")

socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(("", PORT), TrivynaLocalHandler) as httpd:
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping local server.")
