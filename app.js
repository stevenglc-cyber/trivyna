// TRIVYNA Health & Diet AI - Frontend JavaScript Controller

// 1. STATE MANAGEMENT
let appState = {
    gender: 'Nam',
    isLoggedIn: false,
    isWordpress: false,
    mockUserId: 1,
    selectedImageBase64: null,
    historyData: [],
    chartInstance: null,
    chatConversation: []
};

// WordPress DB Field Range Configurations
const indicatorRanges = {
    Nam: {
        creatinine: { normal: [62, 115], unit: 'µmol/L', label: 'Creatinine (Thận)' },
        uric_acid: { normal: [0, 420], unit: 'µmol/L', label: 'Acid Uric (Gút)' }
    },
    Nữ: {
        creatinine: { normal: [53, 97], unit: 'µmol/L', label: 'Creatinine (Thận)' },
        uric_acid: { normal: [0, 360], unit: 'µmol/L', label: 'Acid Uric (Gút)' }
    },
    chung: {
        bmi: { normal: [18.5, 22.9], unit: '', label: 'Chỉ số BMI' },
        bp_systolic: { normal: [90, 129], unit: 'mmHg', label: 'Huyết áp Tâm thu' },
        bp_diastolic: { normal: [60, 84], unit: 'mmHg', label: 'Huyết áp Tâm trương' },
        glucose: { normal: [3.9, 5.6], unit: 'mmol/L', label: 'Đường huyết đói' },
        cholesterol: { normal: [0, 5.2], unit: 'mmol/L', label: 'Cholesterol toàn phần' },
        triglycerides: { normal: [0, 1.7], unit: 'mmol/L', label: 'Triglycerides (Mỡ máu)' },
        ast: { normal: [0, 40], unit: 'U/L', label: 'Men gan AST' },
        alt: { normal: [0, 40], unit: 'U/L', label: 'Men gan ALT' },
        urea: { normal: [2.5, 7.1], unit: 'mmol/L', label: 'Urea (Thận)' }
    }
};

// 2. DOCUMENT INITIALIZATION
document.addEventListener('DOMContentLoaded', () => {
    checkAuthStatus();
    
    // Wire up mock auth toggle button
    const btnToggleAuth = document.getElementById('btn-toggle-auth');
    if (btnToggleAuth) {
        btnToggleAuth.addEventListener('click', toggleMockAuth);
    }
});

// Switch Tabs between Indicators and Vision
function switchTab(evt, tabId) {
    const tabContents = document.getElementsByClassName('tab-content');
    for (let i = 0; i < tabContents.length; i++) {
        tabContents[i].classList.remove('active');
    }

    const tabLinks = document.getElementsByClassName('tab-link');
    for (let i = 0; i < tabLinks.length; i++) {
        tabLinks[i].classList.remove('active');
    }

    document.getElementById(tabId).classList.add('active');
    evt.currentTarget.classList.add('active');
}

// Set Biological Gender
function setGender(gender) {
    appState.gender = gender;
    document.getElementById('gender-nam').classList.toggle('active', gender === 'Nam');
    document.getElementById('gender-nu').classList.toggle('active', gender === 'Nữ');
}

// 3. AUTHENTICATION & DATABASE SYNC
async function checkAuthStatus() {
    try {
        const response = await fetch('trivyna-health.php?action=check_auth');
        const data = await response.json();
        appState.isLoggedIn = data.logged_in;
        appState.isWordpress = data.is_wordpress;
        
        const banner = document.getElementById('auth-status-banner');
        const toggleBtn = document.getElementById('btn-toggle-auth');
        
        if (appState.isLoggedIn) {
            banner.className = "auth-banner";
            banner.style.backgroundColor = "#C8E6C9";
            banner.style.borderColor = "#81C784";
            banner.style.color = "#1B5E20";
            banner.querySelector('span').innerText = `Đã đăng nhập tài khoản thành viên (ID: ${data.user_id}). Dữ liệu của bạn đang được đồng bộ.`;
            toggleBtn.innerText = "Đăng xuất (Test Mode)";
            
            // Query history from DB
            loadHealthHistory();
        } else {
            banner.className = "auth-banner";
            banner.style.backgroundColor = "#FFF9C4";
            banner.style.borderColor = "#FFE082";
            banner.style.color = "#F57F17";
            banner.querySelector('span').innerText = "Bạn đang sử dụng phiên bản Khách. Đăng nhập để lưu lịch sử đo và xem đồ thị.";
            toggleBtn.innerText = "Đăng nhập (Test Mode)";
        }
    } catch (e) {
        console.error("Failed to check auth status:", e);
    }
}

// Simulate toggle login for testing on local SQLite/session
async function toggleMockAuth() {
    // We send a session request to the PHP backend or toggle locally for mock database
    appState.isLoggedIn = !appState.isLoggedIn;
    
    // Simulate by calling PHP to change session mock user id
    if (!appState.isWordpress) {
        try {
            // We toggle mock session by setting mock user id
            const newMockId = appState.isLoggedIn ? 1 : 0;
            // Let's create an endpoint in php to toggle auth mock or we mock it locally
            // For standalone, we can write session config or just reload
            // Let's call the php connect script or toggle session locally
            await fetch(`trivyna-health.php?action=check_auth`);
            // We just override session mock user id by reloading page or mock toggle
            window.location.reload();
        } catch (e) {
            console.error(e);
        }
    }
}

// Retrieve History Records
async function loadHealthHistory() {
    try {
        const response = await fetch('trivyna-health.php?action=get_history');
        const res = await response.json();
        if (res.success) {
            appState.historyData = res.data;
        } else if (res.fallback_local) {
            // Read from localStorage on Vercel
            const localHistory = localStorage.getItem('trivyna_local_history');
            appState.historyData = localHistory ? JSON.parse(localHistory) : [];
        }
        
        if (appState.historyData.length > 0) {
            document.getElementById('history-chart-section').style.display = 'block';
            renderHistoryChart();
        }
    } catch (e) {
        console.error("Failed to load history, falling back to localStorage:", e);
        const localHistory = localStorage.getItem('trivyna_local_history');
        appState.historyData = localHistory ? JSON.parse(localHistory) : [];
        if (appState.historyData.length > 0) {
            document.getElementById('history-chart-section').style.display = 'block';
            renderHistoryChart();
        }
    }
}

// Save Current Record to Database
async function saveCurrentRecord(formData) {
    if (!appState.isLoggedIn) return;
    try {
        const response = await fetch('trivyna-health.php?action=save_record', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: jsonPostData(formData)
        });
        const res = await response.json();
        if (res.success) {
            console.log("Health record saved to database successfully.");
            loadHealthHistory();
        } else if (res.fallback_local) {
            // Save to localStorage on Vercel
            saveToLocalStorage(formData);
        }
    } catch (e) {
        console.error("Failed to save health record, saving to localStorage:", e);
        saveToLocalStorage(formData);
    }
}

function saveToLocalStorage(formData) {
    const localHistoryRaw = localStorage.getItem('trivyna_local_history');
    let history = localHistoryRaw ? JSON.parse(localHistoryRaw) : [];
    
    // Create new record structure matching database
    const newRecord = {
        recorded_at: new Date().toISOString().replace('T', ' ').substring(0, 19),
        gender: appState.gender,
        height: formData.height,
        weight: formData.weight,
        bmi: formData.bmi,
        blood_pressure_systolic: formData.bp_systolic,
        blood_pressure_diastolic: formData.bp_diastolic,
        blood_glucose: formData.glucose,
        uric_acid: formData.uric_acid,
        cholesterol: formData.cholesterol,
        triglycerides: formData.triglycerides,
        liver_ast: formData.ast,
        liver_alt: formData.alt,
        kidney_creatinine: formData.creatinine,
        kidney_urea: formData.urea
    };
    
    history.push(newRecord);
    localStorage.setItem('trivyna_local_history', JSON.stringify(history));
    console.log("Health record saved to localStorage successfully.");
    loadHealthHistory();
}

function jsonPostData(formData) {
    return JSON.stringify({
        gender: appState.gender,
        height: formData.height,
        weight: formData.weight,
        bmi: formData.bmi,
        bp_systolic: formData.bp_systolic,
        bp_diastolic: formData.bp_diastolic,
        glucose: formData.glucose,
        uric_acid: formData.uric_acid,
        cholesterol: formData.cholesterol,
        triglycerides: formData.triglycerides,
        ast: formData.ast,
        alt: formData.alt,
        creatinine: formData.creatinine,
        urea: formData.urea
    });
}

// 4. CHART RENDERING (Chart.js)
function renderHistoryChart() {
    const ctx = document.getElementById('historyChart').getContext('2d');
    
    // Destroy previous instance to avoid visual overlapping
    if (appState.chartInstance) {
        appState.chartInstance.destroy();
    }
    
    const dates = appState.historyData.map(r => {
        const d = new Date(r.recorded_at);
        return `${d.getDate()}/${d.getMonth()+1}`;
    });
    const weights = appState.historyData.map(r => r.weight);
    const bmis = appState.historyData.map(r => r.bmi);
    const cholesterols = appState.historyData.map(r => r.cholesterol);
    
    appState.chartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: dates,
            datasets: [
                {
                    label: 'Cân nặng (kg)',
                    data: weights,
                    borderColor: '#F4A77D',
                    backgroundColor: 'rgba(244, 167, 125, 0.1)',
                    yAxisID: 'y-weight',
                    tension: 0.3,
                    fill: true
                },
                {
                    label: 'Cholesterol (mmol/L)',
                    data: cholesterols,
                    borderColor: '#7CB342',
                    backgroundColor: 'transparent',
                    yAxisID: 'y-cholesterol',
                    tension: 0.3
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    grid: { display: false }
                },
                'y-weight': {
                    type: 'linear',
                    position: 'left',
                    title: { display: true, text: 'Cân nặng (kg)' }
                },
                'y-cholesterol': {
                    type: 'linear',
                    position: 'right',
                    title: { display: true, text: 'Cholesterol (mmol/L)' },
                    grid: { drawOnChartArea: false }
                }
            }
        }
    });
}

// 5. DIAGNOSTIC ALERT GENERATION
function generateLocalDiagnostics(formData) {
    const alertsContainer = document.getElementById('diagnostic-alerts-container');
    alertsContainer.innerHTML = ''; // Clear previous alerts
    
    let alerts = [];
    
    // Evaluate BMI
    const bmiVal = formData.bmi;
    let bmiAlert = { text: `BMI: ${bmiVal.toFixed(1)} - `, type: 'success' };
    if (bmiVal < 18.5) {
        bmiAlert.text += 'Thể trạng Thiếu Cân. Cần bổ sung dinh dưỡng dư thừa calo.';
        bmiAlert.type = 'warning';
    } else if (bmiVal >= 18.5 && bmiVal <= 22.9) {
        bmiAlert.text += 'Thể trạng Bình Thường. Hãy duy trì lối sống lành mạnh.';
        bmiAlert.type = 'success';
    } else if (bmiVal >= 23.0 && bmiVal <= 24.9) {
        bmiAlert.text += 'Thể trạng Thừa Cân. Hãy thâm hụt nhẹ calo để kiểm soát cân nặng.';
        bmiAlert.type = 'warning';
    } else {
        bmiAlert.text += 'Thể trạng Béo Phì. Cần tập luyện Cardio nhẹ nhàng và ăn kiêng giảm mỡ bảo vệ khớp.';
        bmiAlert.type = 'danger';
    }
    alerts.push(bmiAlert);

    // Helper checks
    const checkHigh = (val, max, name, unit) => {
        if (val > max) {
            alerts.push({
                text: `${name} cao: ${val} ${unit} (Ngưỡng an toàn tối đa: ${max} ${unit})`,
                type: 'danger'
            });
        }
    };

    // Check labs
    const limits = indicatorRanges[appState.gender];
    const sharedLimits = indicatorRanges.chung;

    if (formData.bp_systolic >= 130 || formData.bp_diastolic >= 80) {
        alerts.push({
            text: `Huyết áp cao: ${formData.bp_systolic}/${formData.bp_diastolic} mmHg (Ngưỡng tối ưu < 120/80 mmHg)`,
            type: 'warning'
        });
    }

    checkHigh(formData.glucose, sharedLimits.glucose.normal[1], 'Đường huyết', sharedLimits.glucose.unit);
    checkHigh(formData.uric_acid, limits.uric_acid.normal[1], 'Acid Uric (Gút)', limits.uric_acid.unit);
    checkHigh(formData.cholesterol, sharedLimits.cholesterol.normal[1], 'Cholesterol', sharedLimits.cholesterol.unit);
    checkHigh(formData.triglycerides, sharedLimits.triglycerides.normal[1], 'Triglycerides', sharedLimits.triglycerides.unit);
    
    if (formData.ast > 40 || formData.alt > 40) {
        alerts.push({
            text: `Men gan cao: AST ${formData.ast} U/L, ALT ${formData.alt} U/L (Ngưỡng an toàn < 40 U/L)`,
            type: 'danger'
        });
    }

    checkHigh(formData.creatinine, limits.creatinine.normal[1], 'Creatinine', limits.creatinine.unit);
    checkHigh(formData.urea, sharedLimits.urea.normal[1], 'Urea', sharedLimits.urea.unit);

    // Render local alert cards
    alerts.forEach(al => {
        const div = document.createElement('div');
        div.className = `diagnostic-alert ${al.type}`;
        div.innerHTML = `<span>${al.type === 'success' ? '✔' : '⚠'} ${al.text}</span>`;
        alertsContainer.appendChild(div);
    });

    return alerts;
}

// 6. HEALTH ANALYSIS & RECOMMENDATIONS USING GEMINI
async function analyzeHealth(event) {
    event.preventDefault();
    
    const height = parseFloat(document.getElementById('input-height').value) / 100; // to meters
    const weight = parseFloat(document.getElementById('input-weight').value);
    const bmiVal = weight / (height * height);
    
    const formData = {
        height: height * 100,
        weight: weight,
        bmi: bmiVal,
        bp_systolic: parseInt(document.getElementById('input-systolic').value) || 0,
        bp_diastolic: parseInt(document.getElementById('input-diastolic').value) || 0,
        glucose: parseFloat(document.getElementById('input-glucose').value) || 0,
        uric_acid: parseFloat(document.getElementById('input-uric').value) || 0,
        cholesterol: parseFloat(document.getElementById('input-cholesterol').value) || 0,
        triglycerides: parseFloat(document.getElementById('input-triglycerides').value) || 0,
        ast: parseInt(document.getElementById('input-ast').value) || 0,
        alt: parseInt(document.getElementById('input-alt').value) || 0,
        creatinine: parseFloat(document.getElementById('input-creatinine').value) || 0,
        urea: parseFloat(document.getElementById('input-urea').value) || 0
    };

    // Show results card, hide placeholder
    document.getElementById('placeholder-card').style.display = 'none';
    document.getElementById('results-card').style.display = 'block';

    // 1. Calculate BMI view
    document.getElementById('result-bmi-val').innerText = bmiVal.toFixed(1);
    const bmiStatusEl = document.getElementById('result-bmi-status');
    bmiStatusEl.className = 'bmi-status';
    if (bmiVal < 18.5) {
        bmiStatusEl.innerText = 'Thiếu cân';
        bmiStatusEl.classList.add('bmi-underweight');
    } else if (bmiVal >= 18.5 && bmiVal <= 22.9) {
        bmiStatusEl.innerText = 'Bình thường';
        bmiStatusEl.classList.add('bmi-normal');
    } else if (bmiVal >= 23.0 && bmiVal <= 24.9) {
        bmiStatusEl.innerText = 'Thừa cân';
        bmiStatusEl.classList.add('bmi-overweight');
    } else {
        bmiStatusEl.innerText = 'Béo phì';
        bmiStatusEl.classList.add('bmi-obese');
    }

    // 2. Generate local diagnostic alerts
    const activeAlerts = generateLocalDiagnostics(formData);
    
    // Save record to database asynchronously
    saveCurrentRecord(formData);

    // Scroll to results
    document.getElementById('results-card').scrollIntoView({ behavior: 'smooth' });

    // 3. Request Gemini AI Analysis
    const customKey = document.getElementById('input-api-key').value;
    
    document.getElementById('ai-diet-box').innerHTML = '<div class="spinner"></div> Đang kết nối AI phân tích thực đơn...';
    document.getElementById('ai-workout-box').innerHTML = '<div class="spinner"></div> Đang kết nối AI lên lịch tập...';
    
    // Prepare prompt
    let alertSummary = activeAlerts.map(a => a.text).join(', ');
    
    let historyContext = "";
    if (appState.historyData.length > 0) {
        historyContext = "Dưới đây là lịch sử cân nặng và chỉ số trước đây của tôi để bạn đánh giá tiến bộ:\n";
        appState.historyData.slice(-5).forEach(h => {
            historyContext += `- Ngày ${h.recorded_at}: Cân nặng ${h.weight}kg, BMI ${h.bmi.toFixed(1)}, Cholesterol ${h.cholesterol} mmol/L.\n`;
        });
        document.getElementById('ai-progress-box').innerHTML = '<div class="spinner"></div> Đang kết nối AI so sánh tiến độ sức khỏe...';
    }

    const dietPrompt = `
    Tôi là một người dùng Việt Nam, giới tính sinh học: ${appState.gender}.
    Thể trạng hiện tại: Chiều cao ${formData.height} cm, Cân nặng ${formData.weight} kg, BMI ${bmiVal.toFixed(1)}.
    Các chỉ số xét nghiệm hiện tại của tôi: Huyết áp: ${formData.bp_systolic}/${formData.bp_diastolic} mmHg, Đường huyết đói: ${formData.glucose} mmol/L, Cholesterol: ${formData.cholesterol} mmol/L, Triglycerides: ${formData.triglycerides} mmol/L, Men gan AST/ALT: ${formData.ast}/${formData.alt} U/L, Creatinine: ${formData.creatinine} µmol/L, Urea: ${formData.urea} mmol/L, Acid Uric: ${formData.uric_acid} µmol/L.
    Cảnh báo sức khỏe phát hiện: ${alertSummary}.
    ${historyContext}
    
    Nhiệm vụ của bạn là đóng vai trò là một Chuyên gia Dinh dưỡng Y học của TRIVYNA. Hãy phân tích các thông số trên để đưa ra:
    1. Đánh giá ngắn gọn sức khỏe hiện tại. Nếu có dữ liệu lịch sử, hãy so sánh xu hướng tiến bộ sức khỏe.
    2. Thiết lập thực đơn Eat Clean 1 ngày chi tiết (Sáng, Trưa, Bữa phụ, Tối) sử dụng các nguyên liệu gần gũi ở Việt Nam. Lưu ý dung hòa được các tình trạng bệnh lý cao ở trên (ví dụ: gút thì kiêng purin/hải sản, thận yếu thì hạn chế kali/đạm động vật, mỡ máu thì kiêng bão hòa, huyết áp cao thì ăn cực nhạt). Hãy ghi rõ hàm lượng gợi ý (ví dụ: 150g ức gà, 1 bát cơm lứt nhỏ...).
    3. Hướng dẫn bài tập thể thao cụ thể (Môn tập, cường độ, thời gian) phù hợp với BMI và sức khỏe (Lưu ý: bảo vệ khớp gối nếu béo phì).
    
    Hãy trả lời bằng tiếng Việt, chia rõ ràng các mục: [ĐÁNH GIÁ SỨC KHỎE], [THỰC ĐƠN EAT CLEAN KHUYẾN NGHỊ], và [CHẾ ĐỘ TẬP LUYỆN]. Giọng văn chuyên nghiệp, động viên chân thành.
    `;

    try {
        const response = await fetch('trivyna-health.php?action=call_gemini', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                api_key: customKey,
                type: 'analysis',
                prompt: dietPrompt
            })
        });
        
        const data = await response.json();
        
        if (data.candidates && data.candidates[0].content.parts[0].text) {
            const aiText = data.candidates[0].content.parts[0].text;
            parseAndDisplayAiResponse(aiText);
        } else {
            throw new Error(data.message || "Không nhận được phản hồi từ AI.");
        }
    } catch (err) {
        document.getElementById('ai-diet-box').innerText = "Không thể kết nối với AI: " + err.message;
        document.getElementById('ai-workout-box').innerText = "Không thể kết nối với AI: " + err.message;
    }
}

// Parse Gemini Response and populate views
function parseAndDisplayAiResponse(text) {
    // Basic section splitting by looking for headings in square brackets
    const sections = {
        progress: '',
        diet: '',
        workout: ''
    };
    
    let currentSection = 'progress';
    const lines = text.split('\n');
    
    lines.forEach(line => {
        const cleaned = line.trim();
        if (cleaned.includes('[ĐÁNH GIÁ') || cleaned.includes('ĐÁNH GIÁ SỨC KHỎE')) {
            currentSection = 'progress';
        } else if (cleaned.includes('[THỰC ĐƠN') || cleaned.includes('THỰC ĐƠN EAT CLEAN')) {
            currentSection = 'diet';
        } else if (cleaned.includes('[CHẾ ĐỘ') || cleaned.includes('CHẾ ĐỘ TẬP LUYỆN')) {
            currentSection = 'workout';
        } else {
            sections[currentSection] += line + '\n';
        }
    });

    // Populate boxes
    document.getElementById('ai-diet-box').innerHTML = formatMarkdownToHtml(sections.diet.trim());
    document.getElementById('ai-workout-box').innerHTML = formatMarkdownToHtml(sections.workout.trim());
    
    if (appState.historyData.length > 0) {
        document.getElementById('ai-progress-box').innerHTML = formatMarkdownToHtml(sections.progress.trim());
    } else {
        // Display general assessment in a header if no history
        const alertsContainer = document.getElementById('diagnostic-alerts-container');
        const assessmentDiv = document.createElement('div');
        assessmentDiv.className = "diagnostic-alert success";
        assessmentDiv.style.backgroundColor = "rgba(46, 125, 50, 0.05)";
        assessmentDiv.style.color = "var(--color-text-primary)";
        assessmentDiv.style.borderColor = "var(--color-border)";
        assessmentDiv.innerHTML = `<strong>Tóm tắt y tế:</strong><br>${sections.progress.trim()}`;
        alertsContainer.prepend(assessmentDiv);
    }

    // Personalized call-to-action suggestions based on health alerts
    updateCtaRecommendation();
}

function updateCtaRecommendation() {
    const title = document.getElementById('course-title');
    const desc = document.getElementById('course-description');
    
    const isObese = appState.historyData.length > 0 && appState.historyData[appState.historyData.length-1].bmi >= 23;
    const hasUric = document.getElementById('input-uric').value > (appState.gender === 'Nam' ? 420 : 360);
    
    if (isObese) {
        title.innerText = "Khóa Học Luyện Tập Giảm Cân Khoa Học";
        desc.innerText = "Chương trình tập luyện tác động thấp, giúp đốt mỡ an toàn, bảo vệ xương khớp cho người thừa cân.";
    } else if (hasUric) {
        title.innerText = "Khóa Học Eat Clean Chuyên Sâu Trị Liệu";
        desc.innerText = "Học cách thiết kế thực đơn giảm purin, muối, hỗ trợ đào thải axit uric tự nhiên tốt cho khớp.";
    } else {
        title.innerText = "Khóa Học Eat Clean Sống Khỏe Toàn Diện";
        desc.innerText = "Làm chủ phương pháp chế biến và cân đối dinh dưỡng lành mạnh chuẩn gia đình Việt.";
    }
}

// Simple parser to format Markdown returned by AI to HTML
function formatMarkdownToHtml(text) {
    if (!text) return "";
    let html = text
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/^- (.*?)$/gm, '<li>$1</li>')
        .replace(/(<li>.*?<\/li>)/s, '<ul>$1</ul>')
        .replace(/\n\n/g, '<br><br>');
    return html;
}

// 7. AI VISION MEAL ANALYSIS
function triggerImageUpload() {
    document.getElementById('image-upload').click();
}

function handleImageSelected(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        appState.selectedImageBase64 = e.target.result;
        
        // Show image preview
        const imgPreview = document.getElementById('image-preview');
        imgPreview.src = e.target.result;
        imgPreview.style.display = 'block';
        
        // Enable analyze button
        document.getElementById('btn-analyze-meal').removeAttribute('disabled');
    }
    reader.readAsDataURL(file);
}

async function analyzeMeal() {
    if (!appState.selectedImageBase64) return;

    const customKey = document.getElementById('vision-api-key').value;
    const btn = document.getElementById('btn-analyze-meal');
    const originalText = btn.innerHTML;
    
    btn.setAttribute('disabled', 'true');
    btn.innerHTML = '<div class="spinner"></div> Đang quét đĩa ăn...';

    // Show result panel and display placeholder loading
    document.getElementById('placeholder-card').style.display = 'none';
    document.getElementById('results-card').style.display = 'block';
    
    document.getElementById('ai-diet-box').innerHTML = '<div class="spinner"></div> AI đang quét hình ảnh đĩa ăn và tính toán dinh dưỡng...';
    document.getElementById('ai-workout-box').innerText = "Hình ảnh đĩa ăn sẽ được phân tích.";

    // Smooth scroll to view
    document.getElementById('results-card').scrollIntoView({ behavior: 'smooth' });

    const visionPrompt = `
    Hãy phân tích bức ảnh đĩa ăn này và thực hiện các yêu cầu sau:
    1. Nhận diện tất cả các loại thực phẩm, nguyên liệu có trong đĩa ăn.
    2. Ước lượng trọng lượng (grams) của từng loại thực phẩm trong ảnh.
    3. Tính toán xấp xỉ lượng Calo (kcal) và hàm lượng đa lượng: Carbohydrate (g), Protein (g), Chất béo Fat (g) của từng loại và tổng cộng cả bữa ăn.
    4. Đưa ra đánh giá xem bữa ăn này có lành mạnh (Eat Clean) hay không và lời khuyên điều chỉnh.
    
    Trả lời bằng tiếng Việt, cấu trúc rõ ràng dạng:
    - [NHẬN DIỆN MÓN ĂN] (Kèm bảng tính calo)
    - [ĐÁNH GIÁ DINH DƯỠNG & LỜI KHUYÊN]
    `;

    try {
        const response = await fetch('trivyna-health.php?action=call_gemini', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                api_key: customKey,
                type: 'vision',
                image_base64: appState.selectedImageBase64,
                prompt: visionPrompt
            })
        });
        
        const data = await response.json();
        
        if (data.candidates && data.candidates[0].content.parts[0].text) {
            const aiText = data.candidates[0].content.parts[0].text;
            
            // Format and display in diet box
            document.getElementById('ai-diet-box').innerHTML = formatMarkdownToHtml(aiText);
            document.getElementById('ai-workout-box').innerHTML = "Chụp ảnh bữa ăn hoàn thành. Dữ liệu tập luyện của bạn sẽ cập nhật theo thâm hụt calo trong bữa ăn thực tế.";
        } else {
            throw new Error(data.message || "Không nhận dạng được hình ảnh.");
        }
    } catch (err) {
        document.getElementById('ai-diet-box').innerText = "Lỗi phân tích ảnh: " + err.message;
    } finally {
        btn.removeAttribute('disabled');
        btn.innerHTML = originalText;
    }
}

// 8. INTERACTIVE CHAT MESSAGING
async function sendChatMessage() {
    const inputEl = document.getElementById('chat-input-text');
    const question = inputEl.value.trim();
    if (!question) return;

    // Append user message
    const chatHistory = document.getElementById('chat-history');
    const userMsg = document.createElement('div');
    userMsg.className = 'chat-message user';
    userMsg.innerText = question;
    chatHistory.appendChild(userMsg);
    
    inputEl.value = ''; // clear input
    chatHistory.scrollTop = chatHistory.scrollHeight; // scroll down

    // Append AI Typing placeholder
    const aiMsg = document.createElement('div');
    aiMsg.className = 'chat-message ai';
    aiMsg.innerHTML = '<div class="spinner" style="border-top-color: var(--color-green-dark); width:15px; height:15px;"></div> Đang trả lời...';
    chatHistory.appendChild(aiMsg);
    chatHistory.scrollTop = chatHistory.scrollHeight;

    // Create chat prompt with context
    const customKey = document.getElementById('input-api-key').value || document.getElementById('vision-api-key').value;
    
    // Add current query to conversation state
    appState.chatConversation.push({ role: 'user', content: question });
    
    const contextPrompt = `
    Đóng vai trò là Trợ lý Dinh dưỡng Y học TRIVYNA. Bạn vừa thiết lập chế độ ăn/tập luyện hoặc phân tích đĩa ăn của tôi trước đó.
    Dưới đây là câu hỏi mới nhất của tôi: "${question}".
    Hãy trả lời ngắn gọn, thiết thực, động viên và chuẩn y học Việt Nam.
    `;

    try {
        const response = await fetch('trivyna-health.php?action=call_gemini', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                api_key: customKey,
                type: 'analysis',
                prompt: contextPrompt
            })
        });
        
        const data = await response.json();
        
        if (data.candidates && data.candidates[0].content.parts[0].text) {
            const responseText = data.candidates[0].content.parts[0].text;
            aiMsg.innerHTML = formatMarkdownToHtml(responseText);
            appState.chatConversation.push({ role: 'model', content: responseText });
        } else {
            throw new Error();
        }
    } catch (e) {
        aiMsg.innerText = "Xin lỗi, hiện tại tôi không thể kết nối mạng để trả lời câu hỏi. Vui lòng thử lại.";
    } finally {
        chatHistory.scrollTop = chatHistory.scrollHeight;
    }
}
