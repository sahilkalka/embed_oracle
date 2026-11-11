// scripts/seed-sqlite.js
const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { renderMarkdown } = require('../src/services/markdown');
require('dotenv').config();

const dbPath = path.resolve(__dirname, '../prisma/dev.db');
const db = new Database(dbPath);

async function seed() {
  console.log('Seeding SQLite database directly...');
  const now = new Date().toISOString();

  // 1. Admin user
  const existingAdmin = db.prepare("SELECT id, email FROM User WHERE role = 'admin' LIMIT 1").get();
  if (!existingAdmin) {
    const adminEmail = (process.env.ADMIN_DEFAULT_EMAIL || 'admin@embeddedindia.in').trim().toLowerCase();
    const rawPassword = process.env.ADMIN_DEFAULT_PASSWORD;
    if (!rawPassword || rawPassword.length < 16) {
      throw new Error('Set ADMIN_DEFAULT_PASSWORD to at least 16 characters before creating the initial admin account.');
    }
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
    { key: 'site_tagline', value: 'Freelance Engineering Collective' },
    { key: 'contact_email', value: 'info@embeddedindia.in' },
    { key: 'contact_phone', value: '+91 83285 14090' },
    { key: 'contact_address', value: 'Hyderabad, India' },
    { key: 'maintenance_mode', value: 'false' },
    { key: 'enable_adsense', value: 'true' },
    { key: 'adsense_pub_id', value: 'ca-pub-9044714811414113' },
    { key: 'ads_txt_content', value: 'google.com, pub-9044714811414113, DIRECT, f08c47fec0942fa0' },
    { key: 'meta_pixel_id', value: '' },
    { key: 'lead_magnet_title', value: 'The 2026 Embedded Hardware & Firmware Design Checklist' },
    { key: 'lead_magnet_file', value: '/downloads/embedded-design-checklist.pdf' },
    { key: 'promo_banner_active', value: 'true' },
    { key: 'promo_banner_title', value: 'Hire Senior Freelance Embedded Engineers' },
    { key: 'promo_banner_text', value: 'Hardware design, deterministic RTOS firmware, TouchGFX/Qt UI & HMI, and prototype testing. Fixed-bid milestone projects or per-hour/per-day billing.' },
    { key: 'promo_banner_cta', value: 'Discuss Project Scope' },
    { key: 'promo_banner_url', value: '/contact?service=Hardware%20Design' },
    { key: 'hero_title', value: 'Think Big.' },
    { key: 'hero_subtitle', value: 'We Engineer:' },
    { key: 'hero_description', value: 'We are a collective of freelance embedded engineering specialists. We deliver hardware design, deterministic RTOS firmware, TouchGFX & Qt HMIs, and rigorous prototype testing. Engineering services on fixed-bid or hourly/daily billing.' },
    { key: 'active_theme_palette', value: 'cyber-emerald' },
    { key: 'enable_smooth_scroll', value: 'true' },
    { key: 'enable_copilot', value: 'true' },
    { key: 'copilot_greeting', value: 'Hello! I am your Embedded India engineering copilot. We are a collective of freelance engineers providing hardware design, firmware, TouchGFX/Qt UI, and prototype testing on fixed bid or hourly/daily rates. How can I help?' },
    { key: 'lab_status_text', value: 'Freelance Engineering Pods Active • Prototype Bring-up Lab • Fixed-Bid & Hourly/Daily Rates' },
    { key: 'typewriter_words', value: 'High-Speed PCB Hardware,Deterministic RTOS Firmware,TouchGFX & Qt HMIs,Prototype Bring-Up & Testing,Fixed-Bid & Daily Billing' },
    { key: 'theme_bounce_intensity', value: 'bouncy' },
    { key: 'section_hero_enabled', value: 'true' },
    { key: 'section_sandbox_enabled', value: 'true' },
    { key: 'section_featured_projects_enabled', value: 'true' },
    { key: 'section_estimator_enabled', value: 'true' },
    { key: 'section_newsletter_enabled', value: 'true' },
    { key: 'section_blogs_enabled', value: 'false' },
    { key: 'lab_event_enabled', value: 'false' },
    { key: 'ai_auto_gen_enabled', value: 'false' }
  ];

  const upsertSetting = db.prepare(`
    INSERT INTO Setting (id, key, value, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updatedAt = excluded.updatedAt
  `);

  for (const s of initialSettings) {
    upsertSetting.run(crypto.randomUUID(), s.key, s.value, now, now);
  }
  console.log('[SEED] Settings initialized');

  // 3. Official Technical Blog Articles (High-Value In-Depth Pillar Guides)
  const posts = [
    {
      title: 'Bridging the Divide: How to Align Hardware and Firmware Teams',
      slug: 'bridging-the-divide',
      category: 'Co-Development',
      tags: 'firmware,hardware,co-design,agile,pinmux',
      summary: 'Embedded projects frequently suffer delays because hardware and software teams work in silos. Discover proven co-design workflows to eliminate finger-pointing and design respins.',
      readingTime: 7,
      author: 'Embedded India Engineering Team',
      status: 'published',
      publishedAt: '2025-11-16T18:00:29.000Z',
      contentMarkdown: `## The Silo Problem in Embedded Development

Embedded systems projects frequently encounter costly rework, burned engineering hours, and slipped delivery milestones because electronic hardware engineers and embedded firmware developers operate in isolated silos. Software developers often wait weeks until physical prototype PCBs arrive from the assembly line before testing device drivers, only to find that pin assignments multiplex timer DMA channels with critical SPI interrupts, rendering high-speed telemetry impossible.

Conversely, hardware engineers frequently design boards with inadequate test headers, floating reference pins, or missing current-sense shunts, making it impossible for firmware engineers to diagnose brownouts or measure power consumption during deep sleep states.

\`\`\`
+-----------------------+                    +-----------------------+
|  Hardware Engineering |                    |  Firmware Engineering |
+-----------+-----------+                    +-----------+-----------+
            |                                            |
            v                                            v
  Schematic Capture                            Driver Emulation (Renode)
  & Pin Assignment                             & Abstract HAL Layer
            |                                            |
            +-------------------+------------------------+
                                |
                                v
               Joint Pin Multiplexing & SRS Sign-off
                                |
            +-------------------+------------------------+
            |                                            |
            v                                            v
  Prototype PCB Fab                            Driver Unit Tests
  & Flying Probe Testing                       & Virtual HIL Test Bench
\`\`\`

---

### 1. Joint System Requirements Specification (SRS) & Architecture Partitioning
From Day 1, both disciplines must co-author and formally review the **System Requirements Specification (SRS)**. Critical architectural partitioning decisions must never be made unilaterally:

- **Hardware vs. Software Partitioning:** Which mathematical transformations or cryptographic tasks should be offloaded to dedicated hardware peripherals (such as hardware CRC engines, cryptographic coprocessors, or DMA-driven filter blocks) versus calculated in software?
- **Power Budgets Across Operational States:** Explicit current allocation tables must be agreed upon for active execution, peripheral standby, radio burst transmission, and deep low-power sleep modes.
- **Shared Memory Boundaries and Bus Bandwidth Limits:** Calculate peak throughput across shared SPI, I2C, and CAN buses to prevent bus contention under maximum sensor sampling rates.

\`\`\`c
// Example: Hardware Abstraction Layer (HAL) Configuration Structure
// Enables driver development and unit testing before physical silicon arrives
typedef struct {
    uint32_t baudrate;
    uint8_t  data_bits;
    uint8_t  stop_bits;
    bool     enable_dma_rx;
    bool     enable_dma_tx;
    void   (*rx_callback)(const uint8_t *buffer, size_t length);
    void   (*error_callback)(uint32_t error_flags);
} uart_hal_config_t;

int uart_hal_init(const uart_hal_config_t *config);
int uart_hal_transmit_dma(const uint8_t *data, size_t len);
\`\`\`

---

### 2. Early Firmware Emulation & Virtual Prototyping
Do not wait for physical copper fabrication. Modern virtual prototyping tools allow firmware engineers to write, debug, and automate unit tests for board support packages long before surface-mount prototypes land on the test bench:

1. **Renode & QEMU Simulation:** Emulate entire multi-node ARM Cortex-M or RISC-V architectures, including virtual CAN buses, SPI Flash memories, and wireless transceivers.
2. **Evaluation Kits with Identical Silicon:** Mount the target microcontroller on a vendor development board (e.g., STM32 Nucleo or Nordic DK) and cross-wire sensor breakouts to validate driver register sequences.
3. **Mocking Hardware Abstraction Interfaces:** Implement compile-time mock drivers so that state machines and cloud telemetry stacks can be tested on host PC architectures under Continuous Integration (CI).

---

### 3. Testability First: Dedicated Debug Headers and Observation Points
A 10-cent test pad included during schematic capture and PCB routing saves tens of thousands of dollars in emergency lab rework:

- **SWD / JTAG Dedicated Connectors:** Standardize on 10-pin 1.27mm Cortex Debug headers with keyed orientation to prevent inverted cable damage.
- **Ground Loop Reference Clips:** Position unmasked ground test loops within 20mm of high-speed SPI and clock pins to enable low-inductance oscilloscope ground springs.
- **Dedicated UART Debug Console:** Never multiplex the primary engineering logging UART with production communication buses. Reserve dedicated TX/RX test pads for non-intrusive runtime telemetry.

> *"A $0.10 test pad during PCB layout saves $10,000 in firmware debug labor and avoids board respins."*`
    },
    {
      title: 'Hardware-in-the-Loop (HIL) Testing: Why It\'s Crucial for Mission-Critical Systems',
      slug: 'hardware-in-the-loop-hil',
      category: 'Functional Safety',
      tags: 'hil,testing,qa,automotive,iso26262',
      summary: 'Discover how automated Hardware-in-the-Loop test rigs uncover edge-case race conditions, bus faults, and power brownout recoveries before production deployment.',
      readingTime: 8,
      author: 'Embedded India Engineering Team',
      status: 'published',
      publishedAt: '2025-10-10T12:00:00.000Z',
      contentMarkdown: `## Eliminating Field Failures with Automated HIL Test Rigs

In automotive electronic control units (ECUs), industrial automation robotics, and medical devices, firmware bugs are not minor inconveniences—they pose catastrophic physical hazards. Software-only unit testing and manual lab probing fail to reproduce the unpredictable, non-deterministic electrical phenomena that occur in the field: severe battery voltage dips during engine cranking, inductive kickbacks from solenoid relays, and electromagnetic transients across industrial fieldbuses.

**Hardware-in-the-Loop (HIL) testing** bridges this critical verification gap. A dedicated HIL test system connects real, production-intent electronic hardware to an automated simulation environment that synthetically replicates all external sensors, electrical actuators, and vehicle network nodes in hard real time.

\`\`\`
+-----------------------------------------------------------------+
|                    Automated HIL Test Harness                   |
|                                                                 |
|  +--------------------+                   +------------------+  |
|  | Programmable Power | (Voltage Sags)    | Synthetic Sensor |  |
|  | Supply (0-36V DC)  |------------------>| Simulator (DACs) |  |
|  +--------------------+                   +--------+---------+  |
|                                                    |            |
|                                                    v            |
|       +--------------------------------------------+--+         |
|       |    Device Under Test (DUT): Production ECU    |         |
|       |    STM32F4 / CAN-FD / FreeRTOS Deterministic   |         |
|       +---------------------+-------------------------+         |
|                             |                                   |
|                             v                                   |
|  +--------------------------+----+        +------------------+  |
|  | Automated Fault Injector      |------->| Vector CANoe /   |  |
|  | (Open Circuit / Short to GND) |        | PyTest Runner    |  |
|  +-------------------------------+        +------------------+  |
+-----------------------------------------------------------------+
\`\`\`

---

### Core Architecture of a Modern HIL Test Bench
An industrial-grade HIL installation consists of four synchronized functional layers:

1. **Programmable Bipolar Power Supplies:** Capable of executing high-speed arbitrary waveform outputs to simulate ISO 16750-2 electrical transients, including cold-crank dips down to 3.2V, alternator load-dumps up to +87V, and reverse battery connections.
2. **Synthetic Sensor Emulators:** High-precision digital-to-analog converters (DACs), digital potentiometers, and PWM frequency generators that mimic thermistors (NTC/PT100), Hall-effect speed sensors, and piezo pressure transducers.
3. **Automated Fault Insertion Units (FIUs):** High-speed relay matrix switches that programmatically inject electrical faults:
   - Line-to-line short circuits
   - Pin-to-ground and pin-to-battery shorts
   - High-impedance open circuits and intermittent wiring disconnections
4. **Network Protocol Emulators:** Dedicated hardware interfaces (such as Vector CANoe, PEAK-System, or Kvaser) that simulate entire vehicle CAN-FD, LIN, or Ethernet networks, verifying bus-off recovery algorithms.

---

### Automated Python Fault Injection Script
The following Python script illustrates how HIL test harnesses automate regression test sequences using standard PyTest fixtures:

\`\`\`python
import time
import pytest
from hil_instruments import ProgrammablePowerSupply, FaultInsertionUnit, CanInterface

@pytest.fixture(scope="module")
def hil_rig():
    psu = ProgrammablePowerSupply(resource_name="TCPIP::192.168.1.105::INSTR")
    fiu = FaultInsertionUnit(port="/dev/ttyUSB0")
    can = CanInterface(channel=0, bitrate=500000, data_bitrate=2000000)
    
    psu.set_voltage(12.0)
    psu.set_current_limit(3.0)
    psu.output_enable(True)
    yield {"psu": psu, "fiu": fiu, "can": can}
    
    psu.output_enable(False)
    fiu.reset_all_relays()

def test_can_bus_short_to_ground_recovery(hil_rig):
    """Verify ECU detects CAN-H short to GND, enters safe state, and recovers within 50ms."""
    psu = hil_rig["psu"]
    fiu = hil_rig["fiu"]
    can = hil_rig["can"]

    # 1. Verify nominal communication
    msg = can.wait_for_frame(arb_id=0x120, timeout=1.0)
    assert msg is not None, "ECU heartbeat failed under nominal conditions"

    # 2. Inject hard short: CAN_H to Chassis Ground
    fiu.inject_fault(channel="CAN_H", fault_type="SHORT_TO_GND")
    time.sleep(0.200)

    # 3. Clear fault and verify automatic bus-off recovery
    fiu.clear_fault(channel="CAN_H")
    recovery_start = time.perf_counter()
    recovered_msg = can.wait_for_frame(arb_id=0x120, timeout=0.100)
    elapsed = time.perf_counter() - recovery_start

    assert recovered_msg is not None, "ECU failed to recover from CAN bus-off state"
    assert elapsed < 0.050, f"Recovery latency {elapsed*1000:.1f}ms exceeded ISO 26262 50ms requirement"
\`\`\`

---

### Compliance with ISO 26262 & Functional Safety Standards
For automotive systems operating under ASIL-B through ASIL-D safety integrity levels, regulatory bodies strictly mandate automated fault injection evidence. HIL regression test suites must run continuously across every git commit, ensuring that firmware updates never inadvertently compromise safety-critical brownout recovery or watchdog fail-safes.`
    },
    {
      title: 'Beyond the Basics: High-Speed Digital PCB Layout Guidelines',
      slug: 'high-speed-pcb-return-path-optimization',
      category: 'Hardware Design',
      tags: 'pcb,high-speed,impedance,emc,ddr',
      summary: 'A masterclass on high-speed digital PCB routing: controlling return path loop inductance, avoiding split ground plane traps, via stub tuning, and skew matching.',
      readingTime: 9,
      author: 'Embedded India Engineering Team',
      status: 'published',
      publishedAt: '2025-12-05T09:30:00.000Z',
      contentMarkdown: `## The Physics of High-Speed Return Current

In DC and low-frequency electronics, electric current returns to the power source along the path of least electrical resistance. However, once digital signal edge rates (rise/fall times $t_r$) drop below 1 nanosecond—typical of USB 2.0/3.0, Ethernet, SPI flashes clocked above 50 MHz, and DDR memory—the electromagnetic regime transitions fundamentally:

**High-speed return currents travel along the path of least loop inductance, directly beneath the signal conductor on the reference plane.**

When an engineer ignores return path geometry, return currents are forced to divert around plane cutouts, slots, and split power planes. This diversion creates large loop areas ($A$), turning the trace into an efficient loop antenna governed by Faraday's Law of Induction. The result is severe electromagnetic radiation (failing CISPR 25 or FCC Part 15 compliance), inter-symbol interference (ISI), and intolerable crosstalk.

\`\`\`
POOR DESIGN (Crossing Plane Split):
Trace:  =======================> Signal Flow
Plane:  [  GND Plane  ] | Split Slot | [ 3.3V Plane ]
Return: <---------------+             +--------------
                        \             /
                         +--- LOOP ---+ (Massive EMI Loop Radiation!)

PROPER DESIGN (Continuous Reference Plane):
Trace:  =======================> Signal Flow
Plane:  [=========== Solid Unbroken GND Plane ===========]
Return: <====================== Return Current (Directly Underneath)
\`\`\`

---

### 1. Controlled Impedance and Layer Stackup Engineering
To prevent signal reflections that cause ringing and false logic clocking, traces must be engineered with deterministic characteristic impedance ($Z_0$):

- **Single-Ended Microstrip (50 $\\Omega$):** Used for single-ended clocks, SPI, and general high-speed digital signals.
- **Differential Pairs (90 $\\Omega$):** Standard for USB 2.0 (High Speed 480 Mbps) and USB 3.x SuperSpeed.
- **Differential Pairs (100 $\\Omega$):** Standard for 100BASE-TX / 1000BASE-T Ethernet and PCIe interfaces.

$$\\text{Microstrip Impedance (IPC-2141): } Z_0 \\approx \\frac{87}{\\sqrt{\\epsilon_r + 1.41}} \\ln\\left(\\frac{5.98h}{0.8w + t}\\right)$$

Where $h$ is dielectric thickness, $w$ is trace width, $t$ is copper foil thickness, and $\\epsilon_r$ is the relative dielectric permittivity of the substrate material (typically 4.2 to 4.5 for standard FR-4).

---

### 2. The Danger of Crossing Split Planes & Stitching Capacitors
Never route a high-speed signal across a split in its reference plane. If a signal must inevitably transition between different reference layers (e.g. from an internal Layer 3 Ground plane to a Layer 5 Power plane), you must provide a local AC return path:

1. **GND-to-GND Layer Transitions:** Place a ground stitching via within 0.5mm of the signal via. This provides a direct, low-inductance vertical coaxial return path.
2. **GND-to-Power Plane Transitions:** If reference planes are at different DC potentials, place an 0402 ceramic stitching capacitor (typically 10nF to 100nF low-ESR X7R) immediately adjacent to the signal via pair.

---

### 3. Via Stubs and Back-Drilling in Multi-Gigabit Links
A via that passes through an entire 8-layer board to connect Layer 1 to Layer 2 leaves an unused vertical copper column called a **via stub**. At frequencies where the stub length equals one-quarter wavelength ($\\lambda/4$), the stub acts as an open-circuit resonant notch filter, causing severe signal attenuation:

$$f_{resonant} = \\frac{c}{4 \\cdot L_{stub} \\cdot \\sqrt{\\epsilon_{r,eff}}}$$

For high-speed links operating above 3 GHz (such as PCIe Gen 3 or USB 3.2 Gen 2), via stubs exceeding 0.5mm must either be routed on bottom layers or mechanically removed via precision **back-drilling** during PCB fabrication.`
    },
    {
      title: 'Hardware Design Strategies for Minimizing EMI and ESD on Industrial CAN-FD Nodes',
      slug: 'minimizing-emi-esd-industrial-can-fd',
      category: 'Automotive Electronics',
      tags: 'can-fd,emi,esd,automotive,transceiver',
      summary: 'Design bulletproof industrial CAN-FD physical layer interfaces: common-mode chokes, split termination, TVS diode parasitic capacitance limits, and ISO 1042 galvanic isolation.',
      readingTime: 7,
      author: 'Embedded India Engineering Team',
      status: 'published',
      publishedAt: '2025-10-15T14:20:00.000Z',
      contentMarkdown: `## The CAN-FD Signal Integrity Challenge

Controller Area Network Flexible Data-Rate (CAN-FD) elevates traditional automotive bus throughput from 1 Mbps up to 5 Mbps by expanding the payload field data rate while maintaining standard arbitration timings. However, operating at 5 Mbps significantly shortens digital bit times down to 200 nanoseconds.

At these elevated frequencies, asymmetric parasitic capacitances, common-mode noise generated by switching power supplies, and electrostatic discharge (ESD) transients will degrade differential signal eye diagrams, leading to cyclic redundancy check (CRC) errors and catastrophic bus-off resets.

\`\`\`
+-----------------------------------------------------------------------------+
|               Robust Industrial CAN-FD Protection Topology                  |
|                                                                             |
|  +-------------+       +---------------+       +-------+      CAN_H (Bus)   |
|  |             | TXD   | CAN-FD        | CANH  | CM    |========o===========|
|  | MCU /       |------>| Isolated      |------>| Choke |        |           |
|  | Controller  | RXD   | Transceiver   | CANL  | 51 uH |        | [TVS Diodes|
|  |             |<------| (e.g. ISO1042)|------>|       |        |  < 10pF]  |
|  +-------------+       +---------------+       +-------+        |           |
|                               |                     |           |           |
|                               v                     v           |           |
|                       2.5kV Galvanic        Split Termination   |           |
|                       Isolation Barrier     (60R + 60R + 4.7nF) |           |
|                                                                 v           |
|                                                               CAN_L (Bus)   |
|                                                               ==o===========|
+-----------------------------------------------------------------------------+
\`\`\`

---

### 1. Split Termination: Damping Common-Mode Ringing
Standard CAN bus termination uses a single 120 $\\Omega$ resistor across CAN_H and CAN_L at both ends of the transmission line. In CAN-FD applications, **split termination** is mandatory to eliminate high-frequency common-mode electromagnetic emissions:

1. Replace the single 120 $\\Omega$ resistor with two matched 60.4 $\\Omega$ 1% precision resistors in series.
2. Connect the center tap between the two resistors to chassis ground through a 4.7 nF to 10 nF ceramic capacitor rated for at least 50V.
3. This creates a low-pass filter that presents an effective AC short circuit to common-mode noise while maintaining a perfect 120 $\\Omega$ differential termination to the wanted differential signal.

---

### 2. Selecting TVS Diodes: The Capacitance Trap
Transient Voltage Suppressor (TVS) diodes are essential to shield the physical transceiver against IEC 61000-4-2 $\\pm$15kV air-discharge ESD strikes. However, standard silicon TVS diodes exhibit junction capacitances of 50 pF to 100 pF:

- At 500 kbps, 100 pF has negligible impact.
- At 5 Mbps CAN-FD, a 100 pF capacitive load severely rounds the differential rising edges, causing severe phase delay and destroying bit timing sampling points.

**Design Rule:** In CAN-FD designs, specify ultra-low-capacitance automotive-qualified TVS diode arrays with $C_j < 10\\text{ pF}$ (ideally $< 3.5\\text{ pF}$, such as NXP PESD2CANFD or Texas Instruments ESDCAN03-2BWY).

---

### 3. Galvanic Isolation for Harsh Industrial Environments
In large factory campuses or multi-battery electric vehicle powertrains, substantial ground potential differences (often tens of volts) develop between interconnected nodes. Connecting transceivers directly across these disparate grounds causes severe ground loop currents that burn out transceiver silicon.

Employ isolated CAN-FD transceivers with integrated capacitive isolation barriers (such as TI ISO1042 or Analog Devices ADM3055E) providing:
- 2,500 $V_{RMS}$ isolation for 1 minute
- High common-mode transient immunity (CMTI) $> 100\\text{ kV}/\\mu\\text{s}$
- Isolated DC-DC converter supply with low primary-to-secondary coupling capacitance`
    },
    {
      title: 'Designing Ultra-Low-Power Cortex-M Firmware for 10-Year Battery Lifespans',
      slug: 'cortex-m-low-power-firmware-design',
      category: 'Firmware Engineering',
      tags: 'firmware,low-power,cortex-m,freertos,battery',
      summary: 'Architectural secrets for squeezing 10-year coin-cell battery life out of ARM Cortex-M microcontrollers: sleep state transitions, DMA autonomous peripheral routing, and tickless RTOS.',
      readingTime: 8,
      author: 'Embedded India Engineering Team',
      status: 'published',
      publishedAt: '2025-11-02T11:00:00.000Z',
      contentMarkdown: `## The Microampere Budget

Achieving a 10-year operating lifespan from a single 3.0V CR2032 coin cell (typical capacity: 225 mAh) or an industrial 3.6V LiSOCl2 battery requires uncompromising electrical discipline. A continuous average current draw of merely **2.5 microamperes** will deplete a CR2032 in under ten years.

To achieve this, the microcontroller must spend **99.9% of its operational life in deep low-power sleep modes**, waking up for only a few milliseconds to sample sensors, run mathematical calculations, and broadcast wireless packets.

\`\`\`
Average Current Equation:
I_avg = (I_active * T_active + I_sleep * T_sleep) / (T_active + T_sleep)

Example:
Active Current: 8.0 mA for 10 ms (0.010 s)
Sleep Current:  1.2 uA for 59,990 ms (59.990 s)
Resulting I_avg = 2.53 uA  -->  10.1 Years Lifespan on a 225 mAh Cell!
\`\`\`

---

### 1. Navigating Silicon Low-Power Operating Modes
Modern ARM Cortex-M0+/M4/M33 devices (such as STM32L4, Nordic nRF52840, or Silicon Labs EFM32) provide discrete power domains:

| Operating Mode | Typical Current | Wakeup Latency | Retained State | Active Peripherals |
| :--- | :--- | :--- | :--- | :--- |
| **Run Mode** | 4 - 15 mA | 0 ns | CPU, SRAM, Flash | All Clocks & Peripherals |
| **Sleep (WFI)** | 0.8 - 2 mA | < 1 $\\mu$s | CPU Core halted, SRAM on | All Peripherals Active |
| **Stop 2 / Standby** | 1.0 - 2.5 $\\mu$A | 5 - 15 $\\mu$s | Full SRAM retained, CPU off | RTC, LPUART, External GPIO |
| **Shutdown** | 150 - 300 nA | 250 $\\mu$s | Reset condition on wake | Backup Registers only |

**Architectural Principle:** Never sit in a busy-wait polling loop ($while (!flag)$). The CPU must enter sleep immediately after scheduling a peripheral operation.

---

### 2. Autonomous Autonomous Peripheral Interconnects
Wakeups cost energy: turning on the high-speed phase-locked loop (PLL) clock generator consumes substantial transient charge. High-efficiency architectures leverage autonomous hardware links:

\`\`\`c
// Example: Direct Memory Access (DMA) Circular Buffer Reception
// The MCU remains in deep Stop Mode while the LPUART receives 64 bytes
void configure_autonomous_lpuart_rx(void) {
    // 1. Enable Low-Power Clock (LSE = 32.768 kHz) for LPUART1
    RCC->CCIPR |= RCC_CCIPR_LPUART1SEL_0;
    
    // 2. Configure DMA1 Channel 6 for Circular Memory Transfer
    DMA1_Channel6->CPAR = (uint32_t)&(LPUART1->RDR);
    DMA1_Channel6->CMAR = (uint32_t)sensor_rx_buffer;
    DMA1_Channel6->CNDTR = SENSOR_PACKET_SIZE;
    DMA1_Channel6->CCR = DMA_CCR_MINC | DMA_CCR_CIRC | DMA_CCR_TCIE | DMA_CCR_EN;
    
    // 3. Configure Wakeup-on-Character Match or Full Buffer Transfer
    LPUART1->CR3 |= USART_CR3_DMAR | USART_CR3_WUS_0; // Wake on address match
    LPUART1->CR1 |= USART_CR1_UE | USART_CR1_RE;
}
\`\`\`

---

### 3. Implementing FreeRTOS Tickless Idle
Standard real-time operating systems run an interrupt tick every millisecond (1,000 Hz SysTick). This wakes up the core 1,000 times per second, burning substantial battery power even when all tasks are blocked.

In **Tickless Idle Mode** ($configUSE_TICKLESS_IDLE = 1$), FreeRTOS suppresses the SysTick timer when all tasks are delayed. It calculates the expected idle duration, reprograms a low-power hardware timer (such as an LPTIM driven by an external 32.768 kHz crystal), and puts the processor into a deep sleep mode until the next scheduled task or external interrupt occurs.`
    },
    {
      title: 'FreeRTOS Priority Inversion & Deadlock Prevention in Real-Time Systems',
      slug: 'freertos-priority-inversion-mutex-deadlocks',
      category: 'Real-Time Systems',
      tags: 'freertos,rtos,mutex,concurrency,multithreading',
      summary: 'Diagnose and prevent deadly priority inversion, recursive mutex deadlocks, and queue starvation in FreeRTOS firmware architectures using proven real-world patterns.',
      readingTime: 7,
      author: 'Embedded India Engineering Team',
      status: 'published',
      publishedAt: '2025-11-20T16:45:00.000Z',
      contentMarkdown: `## The Mars Pathfinder Catastrophe

In 1997, NASA's Mars Pathfinder spacecraft experienced repeated total system resets on the Martian surface. The root cause was a classic concurrency bug: **unbounded priority inversion**.

A low-priority meteorological logging task acquired a mutual exclusion lock (mutex) protecting an informational bus. Before the low-priority task could finish and release the mutex, an unrelated medium-priority communications task preempted it. Meanwhile, the high-priority attitude control task woke up and attempted to acquire the bus mutex. Because the low-priority task held the lock but could not execute due to the medium-priority task, the high-priority task was starved indefinitely until a hardware watchdog timer timed out and reset the spacecraft.

\`\`\`
HIGH Priority Task:   [Awake] ----------> BLOCKED on Mutex =================> Watchdog Reset!
                                                 ^
MEDIUM Priority Task:             [Preempts & Runs Indefinitely] -------->
                                                 |
LOW Priority Task:    [Acquires Mutex] --- Preempted by Medium ---
\`\`\`

---

### 1. Priority Inheritance Protocol in FreeRTOS
To solve priority inversion, FreeRTOS implements **Priority Inheritance**:

When a high-priority task blocks waiting for a mutex held by a lower-priority task, the kernel **temporarily elevates the priority of the holding task** to match the priority of the highest-priority blocked task. This prevents intermediate medium-priority tasks from preempting the lock holder, allowing it to complete its critical section rapidly and release the mutex.

\`\`\`c
// CORRECT: Use a Mutex (Implements Priority Inheritance)
SemaphoreHandle_t xBusMutex = xSemaphoreCreateMutex();

void vHighPriorityTask(void *pvParameters) {
    for (;;) {
        // Blocks waiting for shared bus mutex
        if (xSemaphoreTake(xBusMutex, portMAX_DELAY) == pdTRUE) {
            read_critical_navigation_sensors();
            xSemaphoreGive(xBusMutex);
        }
        vTaskDelay(pdMS_TO_TICKS(10));
    }
}

// DANGER: Never use binary semaphores for resource exclusion!
// Binary semaphores DO NOT implement priority inheritance.
\`\`\`

---

### 2. Avoiding Recursive Mutex Deadlocks
A deadlock occurs when Task A holds Lock 1 and waits for Lock 2, while Task B holds Lock 2 and waits for Lock 1. Neither can proceed, and both are permanently locked.

**Best Practices to Eliminate Deadlocks:**
1. **Strict Lock Ordering:** If multiple mutexes must be acquired, all tasks in the system must acquire them in the exact same predefined sequence (e.g., always acquire Mutex A before Mutex B).
2. **Never Block Inside Interrupt Service Routines (ISRs):** Mutexes must never be taken inside ISRs. Use lock-free single-producer single-consumer ring buffers or direct-to-task notifications ($vTaskNotifyGiveFromISR$).
3. **Bounded Lock Timeouts:** Avoid $portMAX_DELAY$ in production firmware. Always specify a finite timeout:

\`\`\`c
if (xSemaphoreTake(xBusMutex, pdMS_TO_TICKS(100)) == pdTRUE) {
    // Critical Section
    xSemaphoreGive(xBusMutex);
} else {
    // Timeout Handler: Log telemetry error and recover gracefully
    telemetry_log_error(ERR_MUTEX_TIMEOUT);
}
\`\`\``
    },
    {
      title: 'Building a Production Board Support Package (BSP) in Embedded Linux',
      slug: 'embedded-linux-board-support-package',
      category: 'Embedded Linux',
      tags: 'linux,bsp,yocto,u-boot,kernel,device-tree',
      summary: 'A step-by-step architectural guide to bringing up custom hardware on Embedded Linux: writing Device Tree (.dts) overlays, tailoring U-Boot, and building reproducible Yocto layers.',
      readingTime: 9,
      author: 'Embedded India Engineering Team',
      status: 'published',
      publishedAt: '2025-12-12T13:15:00.000Z',
      contentMarkdown: `## Anatomy of an Embedded Linux Board Support Package

When developing custom industrial edge gateways, medical HMIs, or automotive telemetry gateways powered by MPUs (such as STM32MP1, NXP i.MX8, or TI AM62x), off-the-shelf reference distributions are insufficient. A dedicated **Board Support Package (BSP)** custom-configures every software layer between the bare silicon and user-space applications.

\`\`\`
+-----------------------------------------------------------+
|               User Space Applications & Services          |
+-----------------------------------------------------------+
                             |
+----------------------------v------------------------------+
|               Linux Kernel (Drivers, Subsystems)           |
|            Configured via Device Tree (.dtb)              |
+-----------------------------------------------------------+
                             |
+----------------------------v------------------------------+
|               Secondary Program Loader (U-Boot)           |
+-----------------------------------------------------------+
                             |
+----------------------------v------------------------------+
|               First Stage Bootloader (TF-A / FSBL)        |
+-----------------------------------------------------------+
                             |
+----------------------------v------------------------------+
|               Target Custom Silicon (Hardware MPU)        |
+-----------------------------------------------------------+
\`\`\`

---

### 1. Writing Custom Device Tree Source Files (.dts)
The Device Tree describes the physical hardware topology directly to the Linux kernel without hardcoded C driver source code:

\`\`\`dts
/dts-v1/;
#include "stm32mp157c.dtsi"
#include "custom-board-pinctrl.dtsi"

/ {
    model = "Embedded India Industrial Edge Gateway v2";
    compatible = "ei,stm32mp157c-gateway", "st,stm32mp157";

    aliases {
        serial0 = &uart4;
        ethernet0 = &ethernet0;
    };

    leds {
        compatible = "gpio-leds";
        led-status {
            label = "status:green";
            gpios = <&gpioa 14 GPIO_ACTIVE_HIGH>;
            linux,default-trigger = "heartbeat";
        };
    };
};

&i2c1 {
    pinctrl-names = "default";
    pinctrl-0 = <&i2c1_pins_a>;
    status = "okay";

    rtc@68 {
        compatible = "microcrystal,rv3028";
        reg = <0x68>;
        interrupt-parent = <&gpiob>;
        interrupts = <5 IRQ_TYPE_EDGE_FALLING>;
    };
};
\`\`\`

---

### 2. Bootloader Hardening & Dual-Bank FOTA Failover
A production gateway must never become a brick during over-the-air (OTA) updates. U-Boot is configured with dual-bank (A/B) root filesystems and automatic bootcount rollback:

\`\`\`bash
# U-Boot Environment Script for Fail-Safe A/B Booting
setenv bootcmd '
  if test \${bootcount} -gt 3; then
    echo "Boot failed 3 times! Rolling back to alternate bank...";
    if test \${active_bank} = "A"; then
      setenv active_bank "B";
    else
      setenv active_bank "A";
    fi;
    setenv bootcount 0;
    saveenv;
  fi;
  run boot_active_bank;
'
\`\`\`

---

### 3. Maintaining Reproducible Builds with Yocto Project
To guarantee that firmware images built five years from today are bit-for-bit identical to production factory images, all recipes are packaged into a modular Yocto layer ($meta-embeddedindia$). Pin all git submodules, toolchains, and layer revisions using precise SHA-1 commit hashes rather than floating branch names.`
    },
    {
      title: 'TinyML on the Edge: Deploying Quantized Neural Networks on ARM Cortex-M4',
      slug: 'tinyml-predictive-maintenance-edge-ai',
      category: 'Edge AI',
      tags: 'tinyml,ai,tensorflow,edge,cortex-m,dsp',
      summary: 'Practical guide to running real-time vibration anomaly detection models on microcontrollers using TensorFlow Lite Micro, CMSIS-NN, and 8-bit quantization.',
      readingTime: 8,
      author: 'Embedded India Engineering Team',
      status: 'published',
      publishedAt: '2025-11-28T10:00:00.000Z',
      contentMarkdown: `## Moving Machine Learning from Cloud to Silicon

Streaming continuous high-bandwidth raw sensor data (such as 3-axis accelerometer readings sampled at 6.4 kHz) over wireless networks drains batteries within days and incurs steep cloud bandwidth bills. 

**TinyML** shifts artificial intelligence inference directly onto low-power microcontrollers. By executing quantized neural networks directly on an ARM Cortex-M4 or Cortex-M7 core, edge nodes extract spectral frequency features in real time, consuming only milliwatts of power and transmitting wireless packets only when an anomaly is classified.

\`\`\`
[3-Axis Piezo Sensor] ---> 6.4 kHz ADC Sampling
                              |
                              v
                [CMSIS-DSP FFT Spectrogram]
                1,024-Point Windowed Features
                              |
                              v
           [TensorFlow Lite Micro INT8 Model]
           Quantized Autoencoder Anomaly Score
                              |
            +-----------------+-----------------+
            |                                   |
    Score < Threshold                   Score > Threshold
            |                                   |
            v                                   v
      Stay in Sleep                     Wake Radio & Broadcast
     (1.8 uA Current)                  Emergency Maintenance Alert
\`\`\`

---

### 1. Model Quantization: From Float32 to INT8
Standard deep learning frameworks train neural networks using 32-bit floating-point weights ($Float32$). Microcontrollers with limited SRAM (64 KB to 256 KB) cannot afford 32-bit memory footprints. 

Using Post-Training Quantization (PTQ) in TensorFlow, we quantize all weights and activations down to signed 8-bit integers ($INT8$):
- **Memory Reduction:** Reduces model flash size by **75%** (e.g. from 120 KB to 30 KB).
- **Execution Speedup:** Leverages ARM **CMSIS-NN** assembly instructions (such as SMLAD: Signed Dual Multiply with Addition) to process four 8-bit operations per single clock cycle.

---

### 2. C++ Inference Loop Using TensorFlow Lite Micro

\`\`\`cpp
#include "tensorflow/lite/micro/all_ops_resolver.h"
#include "tensorflow/lite/micro/micro_interpreter.h"
#include "tensorflow/lite/schema/schema_generated.h"
#include "model_data.h" // Converted C byte array

constexpr int kTensorArenaSize = 25 * 1024; // 25 KB memory arena
uint8_t tensor_arena[kTensorArenaSize];

void run_tinyml_inference(const int8_t* fft_features) {
    const tflite::Model* model = tflite::GetModel(g_anomaly_model_data);
    tflite::AllOpsResolver resolver;
    tflite::MicroInterpreter interpreter(model, resolver, tensor_arena, kTensorArenaSize);

    if (interpreter.AllocateTensors() != kTfLiteOk) {
        return; // Allocation failed
    }

    TfLiteTensor* input = interpreter.input(0);
    memcpy(input->data.int8, fft_features, input->bytes);

    // Execute Inference
    if (interpreter.Invoke() == kTfLiteOk) {
        TfLiteTensor* output = interpreter.output(0);
        float anomaly_score = (output->data.int8[0] - output->params.zero_point) * output->params.scale;
        
        if (anomaly_score > ANOMALY_THRESHOLD) {
            trigger_machinery_fault_alert(anomaly_score);
        }
    }
}
\`\`\`

---

### 3. Real-World Lab Benchmark Results
Benchmarked on an ARM Cortex-M4 running at 64 MHz (Nordic nRF52840):
- **Model Size:** 24.2 KB Flash, 14.8 KB Tensor Arena SRAM
- **Inference Latency:** 18.4 milliseconds
- **Total Energy Per Inference:** 0.28 milliJoules (enables 5+ years of battery life on a single 3.6V D-cell).`
    },
    {
      title: 'Strategic PCB Component Obsolescence Management in Industrial Hardware',
      slug: 'pcb-obsolescence-lifecycle-management',
      category: 'Lifecycle Management',
      tags: 'obsolescence,bom,procurement,supply-chain,lifecycle',
      summary: 'Proactive engineering strategies to protect mission-critical industrial electronics from semiconductor obsolescence, supplier EOL notices, and global supply shocks.',
      readingTime: 7,
      author: 'Embedded India Engineering Team',
      status: 'published',
      publishedAt: '2025-10-25T15:30:00.000Z',
      contentMarkdown: `## The Multi-Million Dollar EOL Crisis

In commercial consumer electronics, products are designed for 18-to-24-month lifespans. In industrial utilities, rail transit, and medical instrumentation, products must remain in continuous production and field service for **10 to 25 years**.

When a semiconductor manufacturer issues an unexpected End-of-Life (EOL) or Product Change Notification (PCN) for a critical microcontroller or interface transceiver, companies face painful consequences: emergency Last-Time-Buy (LTB) capital outlays, counterfeit component risks on broker markets, or unplanned $500,000 regulatory recertification respins.

\`\`\`
Traditional Reactive Approach:
Production Running --> EOL Surprise Notice --> Broker Stock Scramble (Counterfeit Risk!) --> Emergency PCB Respin

Proactive Co-Design Approach:
Schematic Dual Footprints + Modular Daughterboards + Software HAL Abstraction = Zero Downtime!
\`\`\`

---

### 1. Dual-Footprint PCB Layout Strategies
A powerful physical defense against silicon shortages is routing **dual footprints** on the printed circuit board:

- **Passives:** Combine overlapping 0402 and 0603 footprint pads for decoupling capacitors and pull-up resistors.
- **Flash & EEPROM Memories:** Overlay SOIC-8 (wide body) and VSON-8 (compact leadless) footprints onto the same PCB coordinate. If supply chains dry up for leadless chips, standard SOIC-8 packages can be mounted on the exact same board without revising copper artwork.
- **Power Regulators:** Design support for both SOT-223 and DPAK packages on high-current LDOs and buck converters.

---

### 2. Firmware Hardware Abstraction Layers (HAL)
Hardware engineers must never design boards without firmware architects ensuring silicon portability. By isolating register-level peripheral drivers behind an abstract C API, swapping out an obsolete STM32 microcontroller for an NXP or TI equivalent requires updating only the underlying HAL driver, leaving 90% of business logic and application code untouched:

\`\`\`c
// Modular Temperature Sensor Interface
typedef struct {
    int (*init)(void);
    int (*read_celsius)(float *temp);
} temperature_sensor_driver_t;

// Factory constructor returns active driver based on board revision strap pins
const temperature_sensor_driver_t* get_sensor_driver(void) {
    if (hardware_read_board_revision() == REV_B) {
        return &sensor_ti_tmp117_driver; // Secondary source sensor
    }
    return &sensor_nxp_pct2075_driver;   // Primary source sensor
}
\`\`\`

---

### 3. Proactive Silicon Lifecycle Monitoring
Integrate API-driven component lifecycle databases (such as SiliconExpert or Octopart Enterprise) directly into your bill-of-materials (BOM) management system. Flag components with:
- Less than 5 years estimated remaining lifespan
- Single-source fabrication facilities
- Extended lead times exceeding 26 weeks`
    },
    {
      title: 'Securing the Boot Chain: Hardware Root-of-Trust and Cryptographic Verification',
      slug: 'securing-the-boot-chain',
      category: 'Embedded Security',
      tags: 'security,cryptography,root-of-trust,secure-boot,ecdsa',
      summary: 'Architecting unbreakable embedded security: hardware Root-of-Trust (RoT), STSAFE-A110 cryptographic companion chips, asymmetric ECDSA-256 signature verification, and anti-rollback guards.',
      readingTime: 8,
      author: 'Embedded India Engineering Team',
      status: 'published',
      publishedAt: '2025-11-10T12:00:00.000Z',
      contentMarkdown: `## Trust Starts at the Hardware Level

In modern connected IoT ecosystems and automotive architectures, physical possession of a device must never equate to ownership of its firmware. Malicious actors utilize physical SWD debug headers, external SPI flash programmers, and voltage glitching attacks to dump proprietary intellectual property, clone firmware onto counterfeit hardware, or inject malicious botnet payloads.

A **Hardware Root-of-Trust (RoT)** establishes an unbreakable foundation: code execution begins strictly from immutable, read-only internal ROM mask memory, with every subsequent software stage cryptographically verified before control is relinquished.

\`\`\`
+-----------------------------------------------------------+
|          Step 1: Immutable Hardware ROM (Silicon)         |
|          Contains Silicon Public Root Key Hash            |
+-----------------------------+-----------------------------+
                              |
                     Verifies ECDSA-256
                              |
+-----------------------------v-----------------------------+
|          Step 2: First-Stage Bootloader (FSBL)            |
|          Verifies U-Boot / OS Signature & Anti-Rollback   |
+-----------------------------+-----------------------------+
                              |
                     Verifies ECDSA-256
                              |
+-----------------------------v-----------------------------+
|          Step 3: Main Operating System / RTOS Kernel      |
+-----------------------------------------------------------+
\`\`\`

---

### 1. Asymmetric Cryptographic Signature Verification
Never rely on symmetric shared keys (such as AES) for firmware verification: if an attacker extracts the AES key from a single field unit, all deployed units in the fleet are compromised.

Instead, employ **Asymmetric Cryptography (ECDSA-256 with SHA-256)**:
1. **Private Signing Key:** Kept securely in a hardware security module (HSM) on corporate air-gapped build servers. Never flashed to production boards.
2. **Public Verification Key:** Embedded into the microcontroller's write-once One-Time-Programmable (OTP) eFuses.
3. The bootloader computes the SHA-256 digest of the incoming firmware image and uses the public key to mathematically verify the ECDSA signature. If a single bit is modified, the signature validation fails and execution is halted.

---

### 2. Dedicated Secure Elements (e.g. STSAFE-A110, ATECC608B)
Microcontroller internal flash memory is vulnerable to side-channel power analysis and focused ion beam (FIB) attacks. Integrating a dedicated **Common Criteria EAL5+ certified Secure Element** provides physical hardware protection:

- **Internal Tamper Sensors:** Automatically zeroes internal cryptographic keys if package decapping, physical drilling, or abnormal thermal spikes are detected.
- **Hardware Monotonic Counters:** Prevents firmware **rollback attacks** (where an attacker flashes an older, authentically signed firmware version containing an unpatched vulnerability).

\`\`\`c
// Example: Hardware Monotonic Counter Anti-Rollback Check
bool verify_firmware_anti_rollback(uint32_t incoming_fw_version) {
    uint32_t active_hardware_counter = 0;
    
    // Read tamper-proof monotonic counter from Secure Element
    if (secure_element_read_counter(&active_hardware_counter) != STATUS_OK) {
        return false; // Communication tamper detected
    }

    if (incoming_fw_version < active_hardware_counter) {
        // Rollback attack detected! Reject firmware.
        security_log_violation(ERR_SECURITY_ROLLBACK_ATTEMPT);
        return false;
    }

    // Update monotonic counter upon successful firmware installation
    secure_element_increment_counter(incoming_fw_version);
    return true;
}
\`\`\`

---

### 3. Locking Debug Interfaces in Production
Prior to factory shipping, production automated test equipment (ATE) must blow the silicon debug protection registers (e.g., STM32 RDP Level 2 or nRF52 APPROTECT):
- Permanently disables JTAG and SWD debug access.
- Restricts boot source strictly to internal flash.
- Prevents memory readouts while preserving in-the-field encrypted firmware updates.`
    }
  ];

  const findExisting = db.prepare(`
    SELECT id, slug FROM Post 
    WHERE slug = ? OR lower(trim(title)) = lower(trim(?))
    LIMIT 1
  `);

  const insertPost = db.prepare(`
    INSERT INTO Post (id, title, slug, category, tags, summary, contentMarkdown, contentHtml, author, status, readingTime, publishedAt, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const updatePost = db.prepare(`
    UPDATE Post SET
      title = ?,
      category = ?,
      tags = ?,
      summary = ?,
      contentMarkdown = ?,
      contentHtml = ?,
      author = ?,
      readingTime = ?,
      updatedAt = ?
    WHERE id = ?
  `);

  for (const post of posts) {
    const compiledHtml = post.contentHtml || renderMarkdown(post.contentMarkdown);
    const existing = findExisting.get(post.slug, post.title);

    if (existing) {
      updatePost.run(
        post.title,
        post.category,
        post.tags,
        post.summary,
        post.contentMarkdown,
        compiledHtml,
        post.author,
        post.readingTime,
        now,
        existing.id
      );
    } else {
      insertPost.run(
        crypto.randomUUID(),
        post.title,
        post.slug,
        post.category,
        post.tags,
        post.summary,
        post.contentMarkdown,
        compiledHtml,
        post.author,
        post.status,
        post.readingTime,
        post.publishedAt,
        now,
        now
      );
    }
  }
  console.log(`[SEED] Blog articles initialized (${posts.length} in-depth pillar guides)`);

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

Embedded India was commissioned to architect an end-to-end electronic climate controller conforming to strict automotive durability standards.

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
