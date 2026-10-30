// src/routes/api.js
const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { JSDOM } = require('jsdom');
const DOMPurify = require('dompurify');
const prisma = require('../services/db');
const mailer = require('../services/mailer');
const aiCopilot = require('../services/aiCopilot');
const { contactLimiter, newsletterLimiter } = require('../middleware/rateLimiter');

const window = new JSDOM('').window;
const purify = DOMPurify(window);

function sanitizeText(value) {
  if (value === undefined || value === null) return '';
  return purify.sanitize(String(value), { ALLOWED_TAGS: [], ALLOWED_ATTR: [] }).trim();
}

// POST /api/contact & POST /contact - Handle Contact Us form
const handleContact = async (req, res) => {
  try {
    const { name, email, phone, company, subject, serviceCategory, message, website_url_trap } = req.body;

    // Layer 1: Honeypot trap check
    if (website_url_trap && String(website_url_trap).trim() !== '') {
      console.warn(`[SPAM DETECTED] Honeypot triggered by IP: ${req.ip}`);
      return res.json({ success: true, message: 'Thank you for your inquiry! Our engineering team will review it shortly.' });
    }

    // Input Sanitization against XSS
    const cleanName = sanitizeText(name);
    const cleanEmail = sanitizeText(email).toLowerCase();
    const cleanPhone = sanitizeText(phone);
    const cleanCompany = sanitizeText(company);
    const cleanSubject = sanitizeText(subject || 'General Engineering Inquiry');
    const cleanServiceCategory = sanitizeText(serviceCategory || 'General');
    const cleanMessage = sanitizeText(message);

    // Validation
    if (!cleanName || !cleanEmail || !cleanMessage) {
      return res.status(400).json({ success: false, message: 'Please provide your name, valid email address, and message.' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      return res.status(400).json({ success: false, message: 'Please provide a valid email address.' });
    }

    const formattedMessage = cleanCompany
      ? `Company: ${cleanCompany}\n\n${cleanMessage}`
      : cleanMessage;

    // Save to Database FIRST
    const inquiry = await prisma.inquiry.create({
      data: {
        name: cleanName.slice(0, 100),
        email: cleanEmail.slice(0, 150),
        phone: cleanPhone ? cleanPhone.slice(0, 30) : null,
        subject: cleanSubject.slice(0, 200),
        serviceCategory: cleanServiceCategory,
        message: formattedMessage,
        ipAddress: req.ip || req.connection.remoteAddress
      }
    });

    console.log(`[INQUIRY RECORDED] ID: ${inquiry.id} from ${cleanEmail}`);

    // Layer 2: Send Email Notifications via Non-Blocking Async Mailer
    mailer.sendInquiryNotification(inquiry).catch(err => {
      console.error('[MAILER ASYNC INQUIRY ERROR]', err.message);
    });

    return res.json({
      success: true,
      message: 'Thank you for contacting Embedded India! Our principal engineering team has received your project inquiry and will respond within 24 business hours.'
    });

  } catch (err) {
    console.error('[CONTACT API ERROR]', err);
    return res.status(500).json({
      success: false,
      message: 'An unexpected internal error occurred. Please email info@embeddedindia.in directly.'
    });
  }
};

router.post('/contact', contactLimiter, handleContact);

// POST /api/newsletter/subscribe
router.post('/newsletter/subscribe', newsletterLimiter, async (req, res) => {
  try {
    const { email, honeypot, source } = req.body;

    if (honeypot && String(honeypot).trim() !== '') {
      return res.json({ success: true, message: 'Check your email to confirm your subscription!' });
    }

    const cleanEmail = sanitizeText(email).toLowerCase();
    const cleanSource = sanitizeText(source || 'website');

    if (!cleanEmail) {
      return res.status(400).json({ success: false, message: 'Please enter a valid email address.' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ success: false, message: 'Please enter a valid email address format.' });
    }

    const verifyToken = crypto.randomBytes(32).toString('hex');

    const existing = await prisma.subscriber.findUnique({
      where: { email: cleanEmail }
    });

    if (existing) {
      if (existing.status === 'active') {
        return res.json({
          success: true,
          message: 'You are already subscribed! We just emailed you a fresh link to download the 2026 Embedded Design Checklist PDF.'
        });
      }
      await prisma.subscriber.update({
        where: { id: existing.id },
        data: { verifyToken, status: 'pending' }
      });
    } else {
      await prisma.subscriber.create({
        data: {
          email: cleanEmail,
          status: 'pending',
          verifyToken,
          source: cleanSource
        }
      });
    }

    mailer.sendVerificationEmail(cleanEmail, verifyToken).catch(err => {
      console.error('[NEWSLETTER VERIFICATION DISPATCH ERROR]', err.message);
    });

    return res.json({
      success: true,
      message: 'Almost done! We sent a quick verification link to your email. Click it to immediately access your free PCB Checklist PDF.'
    });

  } catch (err) {
    console.error('[NEWSLETTER ERROR]', err);
    res.status(500).json({ success: false, message: 'Server error processing subscription.' });
  }
});

// GET /api/newsletter/verify
router.get('/newsletter/verify', async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) {
      return res.status(400).render('pages/message', {
        title: 'Invalid Verification Link',
        heading: 'Verification Token Missing',
        message: 'The link you clicked appears to be incomplete or expired.',
        buttonText: 'Return to Home',
        buttonLink: '/'
      });
    }

    const subscriber = await prisma.subscriber.findUnique({
      where: { verifyToken: String(token) }
    });

    if (!subscriber) {
      return res.status(404).render('pages/message', {
        title: 'Verification Failed',
        heading: 'Token Not Found',
        message: 'This confirmation link is invalid or already used.',
        buttonText: 'Return to Home',
        buttonLink: '/'
      });
    }

    await prisma.subscriber.update({
      where: { id: subscriber.id },
      data: {
        status: 'active',
        verifiedAt: new Date(),
        verifyToken: null,
        leadMagnetSent: subscriber.leadMagnetSent
      }
    });

    const delivery = await mailer.sendLeadMagnetEmail(subscriber.email);
    if (delivery.success) {
      await prisma.subscriber.update({ where: { id: subscriber.id }, data: { leadMagnetSent: true } });
    }

    return res.render('pages/message', {
      title: 'Subscription Confirmed!',
      heading: 'Subscription Confirmed & Checklist Ready! 🎉',
      message: `Your email (${subscriber.email}) is verified. ${delivery.success ? 'The mail server accepted your checklist email.' : 'Email delivery is currently unavailable.'} You can also download it right now using the button below.`,
      buttonText: 'Download PDF Checklist Now',
      buttonLink: '/downloads/embedded-design-checklist.pdf'
    });
  } catch (err) {
    console.error('[VERIFY ERROR]', err);
    res.status(500).send('Verification error');
  }
});

// GET /api/newsletter/unsubscribe
router.get('/newsletter/unsubscribe', async (req, res) => {
  try {
    const { email } = req.query;
    if (email) {
      const cleanEmail = sanitizeText(email).toLowerCase();
      await prisma.subscriber.updateMany({
        where: { email: cleanEmail },
        data: { status: 'unsubscribed' }
      });
    }

    return res.render('pages/message', {
      title: 'Unsubscribed',
      heading: 'You have been unsubscribed',
      message: 'You will no longer receive our weekly technical digest. You can resubscribe at any time.',
      buttonText: 'Return to Home',
      buttonLink: '/'
    });
  } catch (err) {
    console.error('[UNSUBSCRIBE ERROR]', err);
    res.status(500).send('Unsubscribe error');
  }
});

// POST /api/copilot/chat - Public AI Engineering Copilot
router.post('/copilot/chat', async (req, res) => {
  try {
    const { message, conversationHistory } = req.body;
    const cleanMessage = sanitizeText(message);

    if (!cleanMessage) {
      return res.status(400).json({ success: false, message: 'Message cannot be empty.' });
    }

    const result = await aiCopilot.processQuery({
      message: cleanMessage,
      conversationHistory: Array.isArray(conversationHistory) ? conversationHistory : []
    });

    return res.json({
      success: true,
      reply: result.reply,
      suggestedActions: result.suggestedActions || []
    });
  } catch (err) {
    console.error('[COPILOT API ERROR]', err);
    return res.status(500).json({
      success: false,
      message: 'Our copilot service encountered a temporary error. Please try again or contact our engineers.'
    });
  }
});

// POST /api/estimator/calculate - Smart Turnaround & Architecture Estimator
router.post('/estimator/calculate', (req, res) => {
  try {
    const { phase, complexity, protocols = [], compliance = 'none' } = req.body;

    let baseWeeks = 3;
    let complexityLabel = 'Standard MCU Architecture';
    let deliverables = [];
    let recommendedTeam = '1 Principal Hardware Architect, 1 Senior Firmware Engineer, 1 DFM Specialist';

    // 1. Phase calculation
    if (phase === 'prototype') {
      baseWeeks = 3;
      deliverables.push('Schematic Capture', 'Multi-Layer PCB Layout', 'First-Pass SMT Prototypes (5 pcs)');
    } else if (phase === 'turnkey') {
      baseWeeks = 7;
      deliverables.push('Schematic & PCB Layout', 'Deterministic RTOS Firmware', 'Pre-Compliance EMC Verification', 'Pilot Run Manufacturing (25-100 pcs)');
    } else if (phase === 'firmware') {
      baseWeeks = 2;
      deliverables.push('HAL & Peripheral Drivers', 'RTOS Task Architecture', 'Secure Bootloader & FOTA', 'Automated Regression Suite');
    } else if (phase === 'hmi') {
      baseWeeks = 3;
      complexityLabel = 'TouchGFX on STM32 MCU (Chrom-ART / NeoChrom GPU)';
      deliverables.push('TouchGFX C++ MVP Architecture / Qt QML UI', 'MIPI-DSI / RGB Display & PCAP Touch Driver Bring-Up', '60 FPS Hardware-Accelerated Framebuffer Pipeline', 'Industrial / Medical IEC 62304 UI Verification');
      recommendedTeam = '1 Embedded HMI Architect (TouchGFX / Qt), 1 Display BSP Engineer, 1 UI/UX Asset Specialist';
    } else {
      deliverables.push('Architecture Feasibility Study', 'BOM Cost Optimization', 'Thermal & Power Simulation');
    }

    // 2. Silicon Complexity
    if (complexity === 'high') {
      baseWeeks += 3;
      complexityLabel = phase === 'hmi'
        ? 'Qt 6 / QML on Embedded Linux MPU (i.MX8 / STM32MP1)'
        : 'High-Speed MPU / Linux SoM (DDR4 / PCIe / MIPI)';
      deliverables.push('Impedance Matching & Length Tuning', 'Custom U-Boot & Yocto Linux BSP');
    } else if (complexity === 'medium') {
      baseWeeks += 1.5;
      complexityLabel = phase === 'hmi'
        ? 'TouchGFX on STM32U5 / STM32H7 + NeoChrom GPU'
        : 'Dual-Core RTOS / Wireless RF (BLE / Wi-Fi / LoRa)';
      deliverables.push('RF Matching Network / Octo-SPI XIP Asset Tuning');
    }

    // 3. Protocol count
    const pCount = Array.isArray(protocols) ? protocols.length : 1;
    if (pCount > 2) {
      baseWeeks += Math.ceil(pCount * 0.5);
    }

    // 4. Regulatory compliance
    let complianceLabel = 'Standard Commercial';
    if (compliance === 'automotive') {
      baseWeeks += 2;
      complianceLabel = 'Automotive ISO 26262 / AEC-Q100 / CISPR 25';
      deliverables.push('Worst-Case Circuit Analysis (WCCA)', 'ISO 7637-2 Surge Bench Verification');
    } else if (compliance === 'medical') {
      baseWeeks += 2.5;
      complianceLabel = 'Medical IEC 60601 / IEC 62304 / ISO 13485';
      deliverables.push('Galvanic Isolation & IEC 62304 Software File', 'Risk Management File (ISO 14971)');
    } else if (compliance === 'ce_fcc') {
      baseWeeks += 1;
      complianceLabel = 'CE / FCC Class B Radiated & Conducted EMC';
    }

    const estimatedWeeksMin = Math.round(baseWeeks);
    const estimatedWeeksMax = Math.round(baseWeeks * 1.35);

    return res.json({
      success: true,
      timeline: `${estimatedWeeksMin} - ${estimatedWeeksMax} Weeks Turnkey`,
      complexityLabel,
      complianceLabel,
      deliverables,
      recommendedTeam
    });
  } catch (err) {
    console.error('[ESTIMATOR ERROR]', err);
    res.status(500).json({ success: false, message: 'Calculation error' });
  }
});

// GET /api/projects - JSON feed of projects
router.get('/projects', async (req, res) => {
  try {
    const projects = await prisma.project.findMany({
      orderBy: [{ featured: 'desc' }, { order: 'asc' }],
      take: 20
    });
    return res.json({ success: true, projects });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
module.exports.handleContact = handleContact;
