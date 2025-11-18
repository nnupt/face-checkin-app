// js/main.js - โค้ดฉบับสมบูรณ์สำหรับ GitHub Pages

const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const statusDiv = document.getElementById('status');
const checkinBtn = document.getElementById('checkin-btn');

let faceMatcher = null; // 1. ประกาศตัวแปรสำหรับเก็บฐานข้อมูล Descriptors

// **แก้ไข 1.1: แก้ไขพาธโมเดล**
// ใช้ MODELS_URI ที่ถูกแก้ไขใน config.js แล้ว (ต้องแน่ใจว่าใน config.js คือ /face-checkin-app/models)
Promise.all([
    faceapi.nets.ssdMobilenetv1.loadFromUri(MODELS_URI),
    faceapi.nets.faceLandmark68Net.loadFromUri(MODELS_URI),
    faceapi.nets.faceRecognitionNet.loadFromUri(MODELS_URI)
]).then(startVideo);

// 2. ฟังก์ชันโหลดและเข้ารหัสใบหน้า
async function loadLabeledFaceDescriptors() {
    const descriptors = [];
    
    // วนลูปตามชื่อผู้ใช้ที่กำหนดใน config.js
    for (let i = 0; i < USER_LABELS.length; i++) {
        const label = USER_LABELS[i]; 
        const userDescriptors = [];
        
        // **แก้ไข 2.1: เปลี่ยนเป็น 5 รูป (j <= 5)**
        for (let j = 1; j <= 5; j++) { 
            try {
                // **แก้ไข 2.2: แก้ไขพาธไฟล์ภาพ:** เพิ่มชื่อ Repository '/face-checkin-app'
                // นี่คือการแก้ไขปัญหา Error 404 (Not Found) สำหรับไฟล์ภาพ
                const imagePath = `/face-checkin-app/images/${label}/${j}.jpg`; 
                
                const img = await faceapi.fetchImage(imagePath);
                
                // ตรวจจับและสร้าง Face Descriptor
                const detection = await faceapi.detectSingleFace(img).withFaceLandmarks().withFaceDescriptor();
                
                if (detection && detection.descriptor) {
                    userDescriptors.push(detection.descriptor);
                } else {
                    console.warn(`No face detected in image: ${label}/${j}.jpg`);
                }
            } catch (err) {
                // แสดง Error ที่ชัดเจนขึ้น
                console.error(`❌ Error loading image ${label}/${j}.jpg. Check if file exists at: /images/${label}/${j}.jpg`, err); 
            }
        }
        
        // ถ้ามี Descriptors อย่างน้อย 1 อัน ให้สร้าง LabeledDescriptor
        if (userDescriptors.length > 0) {
            descriptors.push(new faceapi.LabeledFaceDescriptors(label, userDescriptors));
            statusDiv.textContent = `Loaded ${userDescriptors.length} descriptors for ${label}...`;
        }
    }
    
    // สร้าง FaceMatcher จากฐานข้อมูล Descriptors ที่สร้างขึ้น
    return new faceapi.FaceMatcher(descriptors, FACE_MATCH_THRESHOLD);
}


// 3. ปรับฟังก์ชันเริ่มต้น (startVideo)
async function startVideo() {
    statusDiv.textContent = 'Models loaded. Loading face descriptors...';
    
    // โหลดฐานข้อมูลใบหน้าก่อนเปิดกล้อง
    faceMatcher = await loadLabeledFaceDescriptors(); 
    
    if (faceMatcher.labeledDescriptors.length === 0) {
        // หากไม่มี Descriptors เลย จะเกิด Error: expected atleast one input
        statusDiv.textContent = '⚠️ WARNING: No face descriptors loaded. Recognition will not work. Check "images/" folder and file names (1.jpg to 5.jpg).';
    } else {
        statusDiv.textContent = `Successfully loaded ${faceMatcher.labeledDescriptors.length} user labels. Starting video...`;
    }
    
    // เริ่มเปิดกล้องและขอสิทธิ์
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } }) 
        .then(stream => {
            video.srcObject = stream;
            video.addEventListener('play', () => {
                statusDiv.textContent = 'Video started. Detecting faces...';
                
                // เริ่มวนลูปตรวจจับใบหน้า
                setInterval(detectFace, 100);
            });
        })
        .catch(err => {
            statusDiv.textContent = '❌ Error accessing camera: ' + err.message + '. Make sure you are on HTTPS.';
            console.error(err);
        });
}


// 4. ปรับฟังก์ชันตรวจจับใบหน้า (detectFace)
async function detectFace() {
    const displaySize = { width: video.width, height: video.height };
    faceapi.matchDimensions(canvas, displaySize);

    // ตรวจจับใบหน้า
    const detections = await faceapi.detectSingleFace(video).withFaceLandmarks().withFaceDescriptor();
    
    // ล้างและแสดงผล
    const resizedDetections = faceapi.resizeResults(detections, displaySize);
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
    
    if (resizedDetections) {
        // --- ส่วนที่เพิ่มสำหรับการระบุตัวตน ---
        const currentDescriptor = resizedDetections.descriptor;
        const bestMatch = faceMatcher.findBestMatch(currentDescriptor);
        // ------------------------------------
        
        faceapi.draw.drawDetections(canvas, resizedDetections);
        
        // แสดงผลลัพธ์
        const box = resizedDetections.detection.box;
        const drawBox = new faceapi.draw.DrawBox(box, { label: bestMatch.toString() });
        drawBox.draw(canvas);
        
        if (bestMatch.label !== 'unknown') {
            statusDiv.textContent = `Welcome, ${bestMatch.label.toUpperCase()}! Ready to check-in.`;
            checkinBtn.disabled = false;
            // เก็บชื่อผู้ใช้ที่ระบุได้
            checkinBtn.dataset.userLabel = bestMatch.label; 
        } else {
            statusDiv.textContent = 'Face detected, but user unknown.';
            checkinBtn.disabled = true;
        }
        
    } else {
        statusDiv.textContent = 'No face detected. Please face the camera.';
        checkinBtn.disabled = true;
    }
}


// 5. การเช็คอิน (ต้องส่งไปยัง Backend Service)
checkinBtn.addEventListener('click', () => {
    const userLabel = checkinBtn.dataset.userLabel; 
    
    if (!userLabel) {
        alert('Cannot check-in. Please wait for face recognition.');
        return;
    }
    
    // ⚠️ ต้องเปลี่ยน URL นี้เป็น Netlify Function/Backend ของคุณเอง
    const checkinUrl = 'https://[YOUR_BACKEND_SITE_NAME].netlify.app/.netlify/functions/checkin'; 
    
    statusDiv.textContent = `Checking in ${userLabel}...`;
    
    fetch(checkinUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            user_label: userLabel
        })
    }).then(response => response.json())
      .then(data => {
          if (data.success) {
              alert(`Check-in successful! Welcome, ${userLabel}.`);
              statusDiv.textContent = `Check-in successful for ${userLabel}.`;
          } else {
              alert('Check-in failed: ' + data.message);
              statusDiv.textContent = 'Check-in failed.';
          }
      }).catch(err => {
          alert('Network Error connecting to check-in service.');
          statusDiv.textContent = 'Connection error. Check console for details.';
      });
});
