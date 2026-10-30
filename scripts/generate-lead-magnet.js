// scripts/generate-lead-magnet.js
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

const outputDir = path.join(__dirname, '../public/downloads');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

const outputPath = path.join(outputDir, 'embedded-design-checklist.pdf');

function generateLeadMagnet() {
  const doc = new PDFDocument({ margin: 40, size: 'A4' });
  const writeStream = fs.createWriteStream(outputPath);
  doc.pipe(writeStream);

  // Brand Header
  doc.rect(0, 0, 612, 90).fill('#007f5f');
  
  doc.fillColor('#ffffff').fontSize(24).font('Helvetica-Bold')
     .text('EMBEDDED INDIA', 40, 25);
  doc.fontSize(10).font('Helvetica')
     .text('Think big. We do! | www.embeddedindia.in | info@embeddedindia.in', 40, 55);

  doc.moveDown(4);

  // Title
  doc.fillColor('#192c27').fontSize(20).font('Helvetica-Bold')
     .text('The 2026 Embedded Hardware & Firmware Design Checklist', 40, 115);
  doc.fontSize(11).font('Helvetica-Oblique').fillColor('#55a630')
     .text('Engineering Guidelines: From Schematic Review to Volume Production Ready', 40, 142);

  doc.moveDown(1.5);

  const sections = [
    {
      title: '1. Schematic Design & Component Selection',
      items: [
        '[ ] Verify pin multiplexing: ensure SPI, I2C, and UART peripherals do not clash with boot mode pins.',
        '[ ] Decoupling Capacitors: Place 0.1uF ceramic caps as close as possible to every VDD pin with minimal via inductance.',
        '[ ] Pull-up / Pull-down resistors: Verify open-drain I2C bus values (2.2k - 4.7k ohm depending on capacitive load).',
        '[ ] Reverse polarity and ESD protection: Include TVS diodes on USB, RS-485, and user-accessible I/O headers.',
        '[ ] Second-source availability: Ensure critical microcontrollers and regulators have multiple distributors.'
      ]
    },
    {
      title: '2. PCB Layout & High-Speed Signal Integrity',
      items: [
        '[ ] Continuous reference ground plane directly beneath high-speed digital and RF traces.',
        '[ ] Differential pair routing: Impedance match USB (90 ohm) and Ethernet (100 ohm) within 5 mil length delta.',
        '[ ] Thermal relief: Adequate thermal vias beneath power switching ICs, LDOs, and MOSFET pads.',
        '[ ] IPC-2221 trace width compliance for current rating and max allowable temperature rise (Delta T < 10°C).',
        '[ ] Clear 30-mil clearance from PCB edge for all components to prevent panel depaneling stress damage.'
      ]
    },
    {
      title: '3. Firmware Architecture, RTOS & Security',
      items: [
        '[ ] Hardware Watchdog Timer: Implement independent WDT refresh with timeout safe-mode recovery.',
        '[ ] Secure Boot & Signature Verification: Flash digital signature verification before loading application code.',
        '[ ] Non-blocking I/O: Ensure sensor communication operates via DMA or ISR with ring-buffers.',
        '[ ] Fault logging: Persistent crash logs stored in internal Flash or EEPROM with stack trace.'
      ]
    },
    {
      title: '4. Design for Manufacturing (DFM) & Testing',
      items: [
        '[ ] Dedicated SWD / JTAG test pads (1.27mm or 2.54mm) for automated bed-of-nails pogo pin fixtures.',
        '[ ] Fiducial markers: At least 3 fiducials placed on diagonal corners of the board for SMT pick-and-place cameras.',
        '[ ] Bill of Materials (BOM) contains verified manufacturer part numbers (MPN) and active lifecycle status.'
      ]
    }
  ];

  let currentY = 175;

  sections.forEach((sec) => {
    // Section Header Box
    doc.rect(40, currentY, 515, 22).fill('#E6F0EE');
    doc.fillColor('#007f5f').fontSize(12).font('Helvetica-Bold')
       .text(sec.title, 48, currentY + 5);
    
    currentY += 30;

    sec.items.forEach(item => {
      doc.fillColor('#192c27').fontSize(9.5).font('Helvetica')
         .text(item, 50, currentY, { width: 500, lineGap: 3 });
      currentY += 20;
    });

    currentY += 10;
  });

  // Footer Banner
  doc.rect(40, 740, 515, 55).fill('#192c27');
  doc.fillColor('#55a630').fontSize(11).font('Helvetica-Bold')
     .text('NEED CUSTOM HARDWARE OR FIRMWARE ENGINEERING?', 55, 752);
  doc.fillColor('#ffffff').fontSize(9).font('Helvetica')
     .text('Embedded India delivers full-cycle design, PCB prototyping, HIL testing, and volume manufacturing.', 55, 768);
  doc.fillColor('#80b918').fontSize(9).font('Helvetica-Bold')
     .text('Contact us: info@embeddedindia.in | https://embeddedindia.in', 55, 780);

  doc.end();

  writeStream.on('finish', () => {
    console.log(`[SUCCESS] Lead Magnet PDF generated at: ${outputPath}`);
  });
}

generateLeadMagnet();
