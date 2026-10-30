// scripts/seed-sqlite.js
const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const dbPath = path.resolve(__dirname, '../prisma/dev.db');
const db = new Database(dbPath);

async function seed() {
  console.log('Seeding SQLite database directly...');
  const now = new Date().toISOString();

  // 1. Admin user
  const existingAdmin = db.prepare("SELECT id, email FROM User WHERE role = 'admin' LIMIT 1").get();
  if (!existingAdmin) {
    const adminEmail = (process.env.ADMIN_DEFAULT_EMAIL || 'admin@embeddedindia.in').trim().toLowerCase();
    const rawPassword = process.env.ADMIN_DEFAULT_PASSWORD || 'AdminEmbedded@2026!';
    const passwordHash = await bcrypt.hash(rawPassword, 10);

    db.prepare(`
      INSERT INTO User (id, username, email, passwordHash, role, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(crypto.randomUUID(), 'admin', adminEmail, passwordHash, 'admin', now, now);
    console.log('[SEED] Admin user created');
  } else {
    console.log(`[SEED] Existing admin account preserved: ${existingAdmin.email}`);
  }

  // 2. Default Site Settings
  const initialSettings = [
    { key: 'site_name', value: 'Embedded India' },
    { key: 'site_tagline', value: 'Think Big. We Do!' },
    { key: 'contact_email', value: 'info@embeddedindia.in' },
    { key: 'contact_phone', value: '+91 83285 14090' },
    { key: 'contact_address', value: 'Hyderabad, India' },
    { key: 'maintenance_mode', value: 'false' },
    { key: 'enable_adsense', value: 'false' },
    { key: 'adsense_pub_id', value: '' },
    { key: 'meta_pixel_id', value: '' },
    { key: 'lead_magnet_title', value: 'The 2026 Embedded Hardware & Firmware Design Checklist' },
    { key: 'lead_magnet_file', value: '/downloads/embedded-design-checklist.pdf' },
    { key: 'promo_banner_active', value: 'true' },
    { key: 'promo_banner_title', value: 'Accelerate Your Next IoT or High-Speed PCB Project' },
    { key: 'promo_banner_text', value: 'From concept and schematics to turnkey production and firmware BSP. Partner with India’s leading embedded engineering team.' },
    { key: 'promo_banner_cta', value: 'Book an Engineering Feasibility Call' },
    { key: 'promo_banner_url', value: '/contact?service=Hardware%20Design' },
    { key: 'hero_title', value: 'Think Big.' },
    { key: 'hero_subtitle', value: 'We Engineer:' },
    { key: 'hero_description', value: 'From early napkin architecture and high-speed PCB layouts to deterministic RTOS firmware, HIL automated testing, and volume SMT manufacturing.' },
    { key: 'active_theme_palette', value: 'cyber-emerald' },
    { key: 'enable_smooth_scroll', value: 'true' },
    { key: 'enable_copilot', value: 'true' },
    { key: 'copilot_greeting', value: 'Hello! I am your Embedded India engineering copilot. Ask me about MCU selection, PCB layouts, RTOS firmware, or scoping your next project!' },
    { key: 'lab_status_text', value: 'Bangalore Lab: Online • 4 Active SMT Lines • HIL Station #2 Active' },
    { key: 'typewriter_words', value: 'High-Speed PCB Layouts,Deterministic RTOS Firmware,Automotive CAN-FD ECUs,Turnkey IoT Hardware,Edge AI & TinyML Nodes' },
    { key: 'theme_bounce_intensity', value: 'bouncy' },
    { key: 'section_hero_enabled', value: 'true' },
    { key: 'section_sandbox_enabled', value: 'true' },
    { key: 'section_featured_projects_enabled', value: 'true' },
    { key: 'section_estimator_enabled', value: 'true' },
    { key: 'section_newsletter_enabled', value: 'true' }
  ];

  const upsertSetting = db.prepare(`
    INSERT INTO Setting (id, key, value, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updatedAt = excluded.updatedAt
  `);

  for (const s of initialSettings) {
    upsertSetting.run(crypto.randomUUID(), s.key, s.value, now, now);
  }
  console.log('[SEED] Settings initialized');

  // 3. Official Technical Blog Articles
  const posts = [
    {
      title: 'Bridging the Divide: How to Align Hardware and Firmware Teams',
      slug: 'bridging-the-divide',
      category: 'Co-Development',
      tags: 'firmware,hardware,co-design,agile',
      summary: 'Embedded projects frequently suffer delays because hardware and software teams work in silos. Discover proven co-design workflows to eliminate finger-pointing.',
      readingTime: 4,
      author: 'Embedded India Engineering Team',
      status: 'published',
      publishedAt: '2025-11-16T18:00:29.000Z',
      contentMarkdown: `## The Silo Problem in Embedded Development\n\nEmbedded systems projects frequently encounter costly rework and slipped deadlines because hardware engineers and firmware developers work in separate silos. Software developers often wait until final prototypes arrive before testing drivers, while hardware engineers may design boards with pin assignments that make DMA or interrupt multiplexing impossible.\n\n### 1. Joint System Requirements & Partitioning\nFrom Day 1, both teams must collaborate on the **System Requirements Specification (SRS)**:\n- Which mathematical operations should be handled in hardware (DSP/FPGA/HW Crypto) versus firmware?\n- Power budgets during sleep, standby, and peak radio transmission.\n- Shared memory boundaries and bus bandwidth limits.\n\n\`\`\`c\n// Example: Hardware abstraction layer (HAL) interface definition\ntypedef struct {\n    uint32_t baudrate;\n    uint8_t data_bits;\n    uint8_t stop_bits;\n    bool enable_dma;\n} uart_config_t;\n\nint uart_init_peripheral(const uart_config_t* cfg);\n\`\`\`\n\n### 2. Early Firmware Emulation & Virtual Prototyping\nDon't wait for copper. Use QEMU, Renode, or breadboard dev kits with identical MCU cores to write peripheral drivers before prototype fabrication.\n\n### 3. Clear Test Points and Debug Headers\nEnsure hardware teams route dedicated SWD/JTAG headers, logic analyzer test points, and UART console pins with 2.54mm or 1.27mm pitch headers.\n\n> "A $0.10 test pad during PCB layout saves $10,000 in firmware debug labor."`,
      contentHtml: `<p>Embedded systems projects frequently encounter costly rework and slipped deadlines because hardware engineers and firmware developers work in separate silos...</p>`
    },
    {
      title: 'Hardware-in-the-Loop (HIL) Testing: Why It\'s Crucial for Mission-Critical Systems',
      slug: 'hardware-in-the-loop-hil',
      category: 'Verification',
      tags: 'hil,testing,qa,automotive',
      summary: 'Discover how automated Hardware-in-the-Loop test rigs uncover edge-case race conditions, bus faults, and power brownout recoveries before deployment.',
      readingTime: 5,
      author: 'Embedded India Engineering Team',
      status: 'published',
      publishedAt: '2025-10-10T12:00:00.000Z',
      contentMarkdown: `## Eliminating Field Failures with Automated HIL Test Rigs\n\nHardware-in-the-Loop (HIL) testing connects physical electronic control units (ECUs) to simulated sensor environments, CAN/LIN bus injects, and programmable power supplies. It enables automated regression testing of corner-case faults that cannot safely be tested on physical vehicles or machines.`,
      contentHtml: `<p>Hardware-in-the-Loop (HIL) testing connects physical electronic control units (ECUs) to simulated sensor environments...</p>`
    }
  ];

  const upsertPost = db.prepare(`
    INSERT INTO Post (id, title, slug, category, tags, summary, contentMarkdown, contentHtml, author, status, readingTime, publishedAt, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(slug) DO UPDATE SET
      title = excluded.title,
      category = excluded.category,
      tags = excluded.tags,
      summary = excluded.summary,
      contentMarkdown = excluded.contentMarkdown,
      contentHtml = excluded.contentHtml,
      updatedAt = excluded.updatedAt
  `);

  for (const post of posts) {
    upsertPost.run(
      crypto.randomUUID(),
      post.title,
      post.slug,
      post.category,
      post.tags,
      post.summary,
      post.contentMarkdown,
      post.contentHtml,
      post.author,
      post.status,
      post.readingTime,
      post.publishedAt,
      now,
      now
    );
  }
  console.log('[SEED] Blog articles initialized');

  // 4. Showcase Engineering Projects
  const projects = [
    {
      title: 'Bus AC Controller',
      slug: 'bus-ac-controller',
      category: 'Automotive',
      industry: 'Commercial Bus & Transit HVAC',
      client: 'Tier-1 Commercial Transit OEM',
      summary: 'A ruggedized electronic climate control module engineered for commercial passenger buses. Features automated multi-zone temperature sensing, compressor clutch modulation, variable blower PWM control, and SAE J1939 CAN communication with the vehicle dashboard.',
      videoUrl: 'https://www.youtube-nocookie.com/embed/ScMzIvxBSi4?rel=0',
      coverImage: '/assets/images/mission1.svg',
      techStack: 'STM32F4, CAN 2.0B / J1939, LIN 2.2, High-Current Relays, FreeRTOS',
      specs: JSON.stringify({
        "Supply Range": "9V - 36V DC Automotive (ISO 7637-2 Surge Protected)",
        "Protocols": "CAN 2.0B (SAE J1939) / LIN 2.2 Bus",
        "Outputs": "4x 20A Relay Bridges, 3x High-Side PWM Drivers (10A)",
        "Inputs": "8x NTC Temp Probes, 2x Digital Pressure Switches",
        "Enclosure": "IP67 Die-Cast Aluminum with Automotive Sealed Connector",
        "Compliance": "Automotive EMI/EMC CISPR 25 Class 3, ISO 16750 Environmental"
      }),
      metrics: JSON.stringify([
        { "label": "Operating Range", "value": "9V - 36V DC" },
        { "label": "CAN Latency", "value": "< 2ms" },
        { "label": "Blower Modulation", "value": "12-bit PWM" },
        { "label": "Fleet Field Units", "value": "1,200+ Active" }
      ]),
      featured: 1,
      order: 1,
      status: 'completed',
      descriptionMarkdown: `## Project Background & Mission Objectives

Commercial transit buses experience extreme thermal and vibrational stress. Standard consumer HVAC microcontrollers routinely suffer from electrical transients caused by alternator load-dumps, heavy inductive blower relays, and multi-zone temperature imbalances across 40-passenger cabins.

Embedded India was commissioned to architect a turnkey electronic climate controller conforming to strict automotive durability standards.

### System Architecture & Hardware Engineering

\`\`\`
+-----------------------------------------------------------+
|               Vehicle CAN-FD / SAE J1939 Bus              |
+-----------------------------+-----------------------------+
                              |
                     +--------v--------+
                     | Isolated CAN-FD |
                     |   Transceiver   |
                     +--------+--------+
                              |
+-----------------------------v-----------------------------+
|               STM32F405 168MHz Cortex-M4F                 |
|             Hardware Floating Point Unit (FPU)            |
|             FreeRTOS Deterministic Scheduler              |
+--------------+-----------------------------+--------------+
               |                             |
      +--------v--------+           +--------v--------+
      |  12-Bit ADC NTC |           | High-Current    |
      |   Signal Chain  |           | Gate Drivers    |
      +--------+--------+           +--------+--------+
               |                             |
         Cabin Probes              Solid-State Blower Relays
\`\`\`

### Key Engineering Achievements

1. **Active ISO 7637-2 Load-Dump Surge Protection**: Built-in TVS clamping and discrete MOSFET reverse-polarity suppression withstands +87V/400ms alternator transients without microcontroller reset.
2. **Deterministic Dual-Zone PID Control**: Implemented parallel FreeRTOS tasks to dynamically regulate evaporator temperature and variable expansion valves with &plusmn;0.5°C cabin precision.
3. **Automated Diagnostic Logging**: Non-volatile SPI FRAM stores real-time error codes, compressor run hours, and refrigerant pressure spikes for OBD-II vehicle maintenance tool readouts.
4. **HIL Verification**: 100% of manufactured production units pass automated Hardware-in-the-Loop functional tests before packaging.`,
      descriptionHtml: `<p>Commercial transit buses experience extreme thermal and vibrational stress...</p>`
    },
    {
      title: 'Smart Water Dispenser',
      slug: 'smart-water-dispenser',
      category: 'IoT',
      industry: 'Commercial CleanTech Appliance',
      client: 'CleanTech Systems Ltd.',
      summary: 'An automated contact-free smart water purification and dispensing kiosk. Features noise-immune capacitive proximity sensing, precise flow-meter calibration, UV-C sterilizer monitoring, and real-time filter degradation telemetry to AWS IoT via MQTT over Wi-Fi.',
      videoUrl: '',
      coverImage: '/assets/images/mission2.svg',
      techStack: 'ESP32-S3 Dual-Core, AWS IoT Core, MQTT, Noise-Immune Capacitive Touch, FreeRTOS',
      specs: JSON.stringify({
        "Microcontroller": "ESP32-S3 Dual-Core Xtensa LX7 @ 240MHz",
        "Wireless": "Wi-Fi 802.11 b/g/n (2.4GHz) + BLE 5.0 Mesh",
        "Flow Precision": "Hall-Effect Turbine Pulse Counter (±2% calibrated)",
        "Sensors": "TDS (Total Dissolved Solids), UV-C Intensity, Tank Pressure",
        "Cloud Protocol": "TLS 1.3 MQTT with AWS X.509 Hardware Keystore",
        "Firmware Updates": "Dual-Bank A/B Fail-Safe FOTA with Rollback Guard"
      }),
      metrics: JSON.stringify([
        { "label": "Touch Latency", "value": "< 15ms" },
        { "label": "Flow Accuracy", "value": "±2% Calibrated" },
        { "label": "Cloud Uptime", "value": "99.95%" },
        { "label": "Active Kiosks", "value": "500+ Nodes" }
      ]),
      featured: 1,
      order: 2,
      status: 'completed',
      descriptionMarkdown: `## The Challenge: Contact-Free Hygiene & Predictive Filter Telemetry

In high-traffic commercial offices and public transport hubs, touchscreens and physical push-buttons present hygiene concerns and suffer mechanical wear. Moreover, water filtration consumables are frequently changed either too early (wasting filter life) or too late (degrading water purity).

Embedded India developed an intelligent contact-free dispensing controller with cloud telemetry.

### Hardware Innovation

- **Sub-Surface Capacitive Sensing**: Custom copper sensor geometry routes through 4mm tempered glass without false triggers from moisture or condensation.
- **UV-C LED Lifetime Monitoring**: Real-time photodiode feedback ensures bacterial inactivation threshold (254nm emission) is consistently maintained.
- **AWS IoT Cloud Telemetry**: Pushes volumetric consumption, TDS water purity indices, and pump duty cycles every 60 seconds over TLS-secured MQTT.

### Results
- 0 physical buttons: 100% contactless gesture activation.
- 35% reduction in consumable maintenance costs through predictive filter replacement alerts.`,
      descriptionHtml: `<p>In high-traffic commercial offices and public transport hubs...</p>`
    },
    {
      title: 'Industrial LoRaWAN Edge Gateway',
      slug: 'industrial-lorawan-edge-gateway',
      category: 'Industrial',
      industry: 'Smart Factory & Utilities',
      client: 'Energy Automation Enterprise',
      summary: 'A rugged dual-frequency 868/915 MHz LoRaWAN edge gateway with 4G LTE fallback, dual Ethernet, and isolated RS485 Modbus RTU/TCP telemetry. Designed for sub-station power metering and harsh outdoor industrial telemetry.',
      videoUrl: '',
      coverImage: '/assets/images/mission3.svg',
      techStack: 'STM32MP157 Dual Cortex-A7 + Cortex-M4, Semtech SX1302, 4G LTE, Yocto Linux',
      specs: JSON.stringify({
        "Processor": "STM32MP157 (Dual Cortex-A7 @ 800MHz + Cortex-M4 @ 209MHz)",
        "LoRa Radio": "Dual Semtech SX1302 Baseband Processors (16 Concurrent Channels)",
        "Cellular": "4G LTE Cat 4 with GNSS Fallback",
        "Field Buses": "2x Isolated RS485 (Modbus RTU), 2x 10/100 Ethernet (Modbus TCP)",
        "Operating Temp": "-40°C to +85°C Industrial Basalt Enclosure",
        "Security": "Hardware Secure Element (STSAFE-A110) Cryptographic Root"
      }),
      metrics: JSON.stringify([
        { "label": "RF Range", "value": "15 km LOS" },
        { "label": "Concurrent Nodes", "value": "2,000+ per Gateway" },
        { "label": "Bus Isolation", "value": "2.5 kV Galvanic" },
        { "label": "Temperature Rating", "value": "-40°C to +85°C" }
      ]),
      featured: 1,
      order: 3,
      status: 'completed',
      descriptionMarkdown: `## Heavy Industrial Utility Telemetry

Electrical substations and manufacturing refineries require zero-downtime data collection across vast campuses with intense electromagnetic interference (EMI). 

This gateway aggregates thousands of battery-operated LoRaWAN power meters and thermal sensors, converts telemetry into standard Modbus TCP / MQTT, and relays data to cloud SCADA systems.

### Multi-Protocol Real-Time Pipeline

1. **Semtech SX1302 Baseband Concentration**: Processes 16 channels simultaneously with packet reception down to -141 dBm sensitivity.
2. **Fail-Safe WAN Redundancy**: Automatic failover between primary Gigabit Ethernet, secondary Wi-Fi bridge, and 4G LTE cellular data backhaul.
3. **Galvanic Isolation**: 2.5 kV isolated RS485 transceiver eliminates ground loop currents in high-voltage industrial sub-stations.`,
      descriptionHtml: `<p>Electrical substations and manufacturing refineries require zero-downtime data collection...</p>`
    },
    {
      title: 'TinyML Predictive Vibration Sensor',
      slug: 'tinyml-predictive-vibration-sensor',
      category: 'Edge AI',
      industry: 'Predictive Machinery Maintenance',
      client: 'Heavy Machinery Manufacturing Group',
      summary: 'Battery-powered wireless sensor node executing quantized neural networks directly on a low-power Cortex-M4 core. Samples 3-axis high-g accelerations up to 6.4 kHz to detect bearing race spalling, shaft unbalance, and cavitation in industrial pumps.',
      videoUrl: '',
      coverImage: '/assets/images/download-2.svg',
      techStack: 'Nordic nRF52840, BLE 5.3, TensorFlow Lite Micro, 3-Axis MEMS 16g, Zephyr RTOS',
      specs: JSON.stringify({
        "Silicon": "Nordic Semiconductor nRF52840 (64MHz ARM Cortex-M4 with FPU)",
        "Accelerometer": "Ultra-Low Noise High-Bandwidth 3-Axis MEMS (±16g, 6.4kHz ODR)",
        "Edge AI Model": "Quantized 8-bit Convolutional Autoencoder (anomaly detection)",
        "Battery Life": "5+ Years on single 3.6V LiSOCl2 D-Cell (15min inference duty)",
        "Wireless Protocol": "BLE 5.3 Long Range (Coded PHY) / Wirepas Mesh",
        "Certification": "ATEX Zone 1 / IECEx Intrinsically Safe Certified"
      }),
      metrics: JSON.stringify([
        { "label": "Battery Life", "value": "5+ Years" },
        { "label": "Sampling Rate", "value": "6.4 kHz" },
        { "label": "Model Size", "value": "24 KB (Int8)" },
        { "label": "Inference Time", "value": "18 ms" }
      ]),
      featured: 0,
      order: 4,
      status: 'completed',
      descriptionMarkdown: `## On-Device Edge Intelligence for Rotating Machinery

Transmitting raw high-frequency vibration streams over wireless networks consumes immense radio power, limiting sensor battery lifespan to weeks. By running quantized neural networks directly at the silicon edge, the sensor node extracts FFT spectral features and only transmits anomalous classifications.

### Technical Achievements

- **Edge Impulse & TFLite Micro Pipeline**: Preprocesses 1,024-point FFT spectrograms in hardware and executes an INT8 autoencoder in 18ms.
- **Ultra-Low Current Consumption**: Consumes only 1.8 µA in deep sleep between periodic wake-up intervals.
- **Immediate Detection**: Identifies early bearing micro-fissures months before catastrophic machine failure.`,
      descriptionHtml: `<p>Transmitting raw high-frequency vibration streams over wireless networks consumes immense radio power...</p>`
    }
  ];

  const upsertProject = db.prepare(`
    INSERT INTO Project (
      id, title, slug, category, industry, client, summary, descriptionMarkdown, descriptionHtml,
      coverImage, gallery, videoUrl, techStack, specs, metrics, featured, \`order\`, status, liveUrl, createdAt, updatedAt
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(slug) DO UPDATE SET
      title = excluded.title,
      category = excluded.category,
      industry = excluded.industry,
      client = excluded.client,
      summary = excluded.summary,
      descriptionMarkdown = excluded.descriptionMarkdown,
      descriptionHtml = excluded.descriptionHtml,
      coverImage = excluded.coverImage,
      videoUrl = excluded.videoUrl,
      techStack = excluded.techStack,
      specs = excluded.specs,
      metrics = excluded.metrics,
      featured = excluded.featured,
      \`order\` = excluded.\`order\`,
      status = excluded.status,
      updatedAt = excluded.updatedAt
  `);

  for (const proj of projects) {
    upsertProject.run(
      crypto.randomUUID(),
      proj.title,
      proj.slug,
      proj.category,
      proj.industry,
      proj.client,
      proj.summary,
      proj.descriptionMarkdown,
      proj.descriptionHtml,
      proj.coverImage,
      null,
      proj.videoUrl,
      proj.techStack,
      proj.specs,
      proj.metrics,
      proj.featured,
      proj.order,
      proj.status,
      null,
      now,
      now
    );
  }
  console.log('[SEED] Projects initialized (4 case studies)');

  // 5. Calculator stats
  const tools = ['pcb-trace', '555-timer', 'led-resistor', 'uart-baud', 'smd-code', 'battery-life', 'trace-impedance'];
  const insertStat = db.prepare(`
    INSERT OR IGNORE INTO CalculatorStat (id, toolName, executionCount, updatedAt)
    VALUES (?, ?, ?, ?)
  `);
  for (const tool of tools) {
    insertStat.run(crypto.randomUUID(), tool, Math.floor(Math.random() * 50) + 10, now);
  }

  console.log('[SEED] Direct SQLite seed complete!');
}

if (require.main === module) {
  seed()
    .catch(err => {
      console.error('[SEED ERROR]', err);
      process.exitCode = 1;
    })
    .finally(() => {
      db.close();
    });
}

module.exports = seed;
