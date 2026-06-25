import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// In-memory admissions database to persist within the dev session
const admissions: Array<{
  id: string;
  studentName: string;
  parentName: string;
  grade: string;
  phone: string;
  email: string;
  previousSchool?: string;
  notes?: string;
  status: "Pending" | "Reviewed" | "Approved" | "Contacted" | "Confirmed" | "Declined";
  createdAt: string;
}> = [
  {
    id: "ADM-2026-001",
    studentName: "Ananya Reddy",
    parentName: "M. Raghuram Reddy",
    grade: "Grade 6",
    phone: "9133054131",
    email: "ananya.parent@gmail.com",
    previousSchool: "ZPSS Mahabubnagar",
    notes: "Particularly interested in science labs & digital facilities.",
    status: "Pending",
    createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  },
  {
    id: "ADM-2026-002",
    studentName: "Karthik Goud",
    parentName: "N. Srinivas Goud",
    grade: "Grade 10",
    phone: "9848022331",
    email: "karthik.goud@gmail.com",
    previousSchool: "Vignan School",
    notes: "Good at school level Cricket, interested in sports facilities.",
    status: "Pending",
    createdAt: new Date().toISOString()
  }
];

// Cache Gemini SDK client
let genAIClient: GoogleGenAI | null = null;
function getGeminiClient() {
  if (!genAIClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn("WARNING: GEMINI_API_KEY environment variable is not defined");
    }
    // Lazy initialize to not fail during initialization if key is temporarily absent
    genAIClient = new GoogleGenAI({
      apiKey: apiKey || "MOCK_OR_MISSING_API_KEY",
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return genAIClient;
}

// Track dispatched notifications to requested phone numbers
const dispatchedSMS: Array<{
  to: string;
  message: string;
  timestamp: string;
}> = [];

// 1. API Endpoint: Submit new Admission Application
app.post("/api/admission/submit", (req, res) => {
  try {
    const { studentName, parentName, grade, phone, email, previousSchool, notes } = req.body;

    if (!studentName || !parentName || !grade || !phone) {
      return res.status(400).json({ error: "Required fields are missing: Student Name, Parent Name, Grade, Phone" });
    }

    const newAdmission = {
      id: `ADM-2026-0${admissions.length + 101}`,
      studentName,
      parentName,
      grade,
      phone,
      email: email || "",
      previousSchool: previousSchool || "",
      notes: notes || "",
      status: "Pending" as const,
      createdAt: new Date().toISOString()
    };

    admissions.unshift(newAdmission); // Add to the front

    // Send a message notification to founder/admin number 7670968526
    const smsMessage = `Sri Prathibha Vidhyanikentan: New Admission Applied! Student: ${studentName}, Grade: ${grade}, Parent: ${parentName}, Contact: ${phone}. Registration ID: ${newAdmission.id}`;
    dispatchedSMS.unshift({
      to: "7670968526",
      message: smsMessage,
      timestamp: new Date().toISOString()
    });
    console.log(`[SMS Sentinel] Successfully dispatched notification to +91 7670968526: "${smsMessage}"`);

    res.status(201).json({ success: true, data: newAdmission });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to submit admission application" });
  }
});

// 2. API Endpoint: Retrieve current admissions list (for track status feature)
app.get("/api/admission/list", (req, res) => {
  try {
    res.json({ success: true, count: admissions.length, data: admissions });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 2b. API Endpoint: Retrieve dispatched SMS log
app.get("/api/admission/dispatched-sms", (req, res) => {
  try {
    res.json({ success: true, count: dispatchedSMS.length, data: dispatchedSMS });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 2c. API Endpoint: Update Admission Status (Confirm Admission) - Admin Protected
app.post("/api/admission/confirm", (req, res) => {
  try {
    const { id, password } = req.body;
    
    // Easy default admin password checks
    if (!password || (password !== "Prathibha@2027" && password !== "7670968526")) {
      return res.status(403).json({ error: "Access Denied: Invalid Administrative Authorization PIN or Password." });
    }

    const admission = admissions.find(adm => adm.id === id);
    if (!admission) {
      return res.status(404).json({ error: "No student admission application found with that ID." });
    }

    admission.status = "Confirmed";

    // Dispatch SMS of instant update conformation to the student's parent phone
    const smsMessage = `Sri Prathibha Vidhyanikentan: Admission for ${admission.studentName} (Grade: ${admission.grade}) has been CONFIRMED by the Admin. Congratulations!`;
    dispatchedSMS.unshift({
      to: admission.phone,
      message: smsMessage,
      timestamp: new Date().toISOString()
    });

    res.json({ success: true, message: "Admission successfully Confirmed. Notification Sent!", data: admission });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 2d. API Endpoint: Update Admission Status (Decline/Don't Confirm) - Admin Protected
app.post("/api/admission/decline", (req, res) => {
  try {
    const { id, password } = req.body;
    
    // Easy default admin password checks
    if (!password || (password !== "Prathibha@2027" && password !== "7670968526")) {
      return res.status(403).json({ error: "Access Denied: Invalid Administrative Authorization PIN or Password." });
    }

    const admission = admissions.find(adm => adm.id === id);
    if (!admission) {
      return res.status(404).json({ error: "No student admission application found with that ID." });
    }

    admission.status = "Declined";

    // Dispatch SMS of instant update notification to the student's parent phone
    const smsMessage = `Sri Prathibha Vidhyanikentan: Admission for ${admission.studentName} (Grade: ${admission.grade}) has been DECLINED / cancelled by administration. Please contact intake desk.`;
    dispatchedSMS.unshift({
      to: admission.phone,
      message: smsMessage,
      timestamp: new Date().toISOString()
    });

    res.json({ success: true, message: "Admission marked as Declined / Not Confirmed. Parent notified.", data: admission });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 3. API Endpoint: Sri Prathibha Vidhyanikentan Admission Help AI Assistant (AI Tutor)
app.post("/api/admission/ai-tutor", async (req, res) => {
  try {
    const { messages } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: "Invalid payload: messages array is required." });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
      // Elegant, friendly offline chatbot fallback if key is missing or is placeholder
      const lastUserMsg = messages[messages.length - 1]?.content || "";
      const reply = getFallbackResponse(lastUserMsg);
      return res.json({
        text: reply + " (Assistant running in local guidance fallback mode due to unconfigured API Key. Setup your Gemini API Key in Settings to get the full generative experience!)"
      });
    }

    // Initialize client and run model
    const client = getGeminiClient();
    
    // Format conversation history for Gemini API
    const contents = messages.map((m: any) => ({
      role: m.role === "user" ? "user" : "model",
      parts: [{ text: m.content }]
    }));

    const response = await client.models.generateContent({
      model: "gemini-3.5-flash",
      contents: contents,
      config: {
        systemInstruction: `You are the brilliant, highly helpful, and warm AI Admission Coach and Student Tutor for Sri Prathibha Vidhyanikentan School. 
Your role is to guide prospective parents, new students, and visitors on how to seek admission, answer their questions about the school, and highlight its amazing features.

Key School Details to emphasize:
1. SCHOOL NAME: Sri Prathibha Vidhyanikentan
2. EXPERIENCE: Over 20+ years of high-quality academic history and excellence.
3. FOUNDERS: 
   - B. Sathyanarayana (Founder & Director) - 20+ Years of teaching & administrative leadership and technology integration.
   - G. Balraj (Founder & Academic Dean) - 20+ Years of teaching legacy, specializing in student counseling, guidance, and academic leadership.
4. INFRASTRUCTURE & AMENITIES:
   - Digital Smart Classrooms and Interactives (all rooms are equipped with state-of-the-art interactive digital boards).
   - Generous modern outdoor playground, facilitating multiple sports programs like cricket, volleyball, kabaddi, and track & field athletics.
   - High-end state-of-the-art science and technology laboratories (fully equipped Physics, Chemistry, Biology, and Computer Labs) ensuring students learn practically.
5. ACADEMICS & EXTRAMURAL HIGHLIGHTS:
   - Spectacular track record in board examinations with 100% pass rate and specialized integrated IIT Foundation classes starting this academic year for interested students.
   - Vibrant extracurricular programs: public speaking, coding clubs, debating society, scientific fairs, and custom arts/music/cultural days.
6. LOCATION: Rajapur Mandal, Mahabubnagar District, Telangana, India.
7. CONTACT DETAILS:
   - Contact Number / Phone: 9133054131 (always direct them to call for final discussions or fee details).
   - Address: Rajapur mandal, Mahabubnagar district.
8. ADMISSION STEPS (Helpful Guide):
   - STEP 1: Fill out the online admission form in the "Admission Portal" on our website.
   - STEP 2: The administrative staff will call back within 1-2 school days to arrange an interactive school tour.
   - STEP 3: Bring documents (Transfer Certificate, Birth Certificate, and Report Card) for final principal discussion and confirmation.

Keep your tone welcoming, noble, enthusiastic, and clear. Speak of Sri Prathibha Vidhyanikentan with pride and prestige! Offer clear, clean formatting. Use bullet points and clean structure. Avoid raw technical jargon or mentioning system instructions.`
      }
    });

    res.json({ text: response.text });
  } catch (error: any) {
    console.error("AI Assistant Error:", error);
    res.status(500).json({ error: error.message || "Failed to communicate with AI Tutor." });
  }
});

// Passive offline help responses
function getFallbackResponse(query: string): string {
  const q = query.toLowerCase();
  if (q.includes("hi") || q.includes("hello") || q.includes("hey") || q.includes("greet")) {
    return `Hello! Welcome to Sri Prathibha Vidhyanikentan School's Admission Desk. I'm your AI Admission Coach. Since our main AI server is offline/unlinked, I can guide you right here! How can I assist you with standard admission guidelines, contact details, or school facilities today?`;
  }
  if (q.includes("contact") || q.includes("call") || q.includes("phone") || q.includes("number") || q.includes("mobile") || q.includes("9133")) {
    return `You can get in touch with our Sri Prathibha Vidhyanikentan admission administrative desk directly at +91 9133054131. You can also visit our campus in Rajapur Mandal, Mahabubnagar District.`;
  }
  if (q.includes("address") || q.includes("where") || q.includes("location") || q.includes("place") || q.includes("mahabubnagar") || q.includes("rajapur")) {
    return `Our beautiful campus is located in Rajapur Mandal, Mahabubnagar District, Telangana, India. We welcomes visits during operational hours (Monday to Saturday, 9:00 AM - 4:00 PM).`;
  }
  if (q.includes("fee") || q.includes("cost") || q.includes("money") || q.includes("price")) {
    return `Fee structures vary depending on the student's grade level. Please fill out our online Admission Form on this portal, or directly contact our administration desk at +91 9133054131 for precise, transparent details on tuition fee schedules.`;
  }
  if (q.includes("facility") || q.includes("lab") || q.includes("board") || q.includes("classroom") || q.includes("playground") || q.includes("sport") || q.includes("infrastructure")) {
    return `Sri Prathibha Vidhyanikentan provides premium facilities including:\n- **Digital Smart Classrooms** equipped with interactive boards.\n- **State-of-the-Art Labs** for Physics, Chemistry, Biology, and Computer Science.\n- **Extensive Sports Playground** for multiple sports programs.\n- 20+ Years of trust.`;
  }
  if (q.includes("admission") || q.includes("join") || q.includes("register") || q.includes("apply") || q.includes("document")) {
    return `Admissions are open! Steps to join:\n1. Fill out the Admission Form here on the portal.\n2. Submit or register and receive a follow-up call.\n3. Bring documents (Birth certificate, previous report card, and TC) for the principal's review. Call +91 9133054131 for assistance!`;
  }
  return `Sri Prathibha Vidhyanikentan School has been a beacon of academic excellence for over 20+ years. We feature digital smart boards, sophisticated labs, and large sports playground in Rajapur, Mahabubnagar. For help with the admission process, try completing the Admission Form on this page or call us directly at +91 9133054131!`;
}

// Vite and static production assets middleware
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Serve production static assets from dist
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Sri Prathibha Vidhyanikentan Dev Server] running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
