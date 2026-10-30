// src/data/servicesData.js
// Single source of truth for the core embedded engineering services

const servicesData = {
  'full-cycle-embedded-product-engineering': {
    slug: 'full-cycle-embedded-product-engineering',
    title: 'Full-Cycle Product Realization',
    discipline: 'System Architecture & Engineering',
    contactCategory: 'Full Turnkey',
    seoTitle: 'Full-Cycle Embedded Product Engineering Architecture - Embedded India',
    seoDescription: 'Turnkey electronic product engineering from napkin architecture and high-speed simulation to volume mass manufacturing and lifecycle sustainment.',
    description: 'Complete electronic product engineering: schematic capture, BOM optimization, thermal simulation, DFM reviews, and production handover.',
    features: [
      {
        title: 'System Architecture & Feasibility',
        description: 'Component trade-off analysis, power tree calculation, bus bandwidth budgeting, and thermal feasibility modeling.'
      },
      {
        title: 'Mixed-Signal Hardware Design',
        description: 'Precision analog front-ends, low-noise power distribution networks, sensor signal conditioning, and robust ESD/EMC surge protection.'
      },
      {
        title: 'High-Density Multi-Layer PCB Layout',
        description: 'Routing up to 16+ layers, HDI microvias, controlled impedance traces, and differential skew matching.'
      },
      {
        title: 'Deterministic Firmware & RTOS',
        description: 'Bare-metal C/C++, FreeRTOS, and Zephyr kernel drivers, memory partitioning, and secure cryptographic bootloaders.'
      },
      {
        title: 'Verification & Automated HIL Testing',
        description: 'Hardware-in-the-Loop test bench automation, fault injection modeling, and automated regression suites.'
      },
      {
        title: 'Turnkey NPI & Technical Documentation',
        description: 'Essential documentation includes full manufacturing data package: Gerbers, ODB++, pick-and-place centroids, panelization, and custom test jig designs.'
      }
    ]
  },

  'embedded-software-firmware-development': {
    slug: 'embedded-software-firmware-development',
    title: 'Embedded Software & Firmware Development',
    discipline: 'Firmware & Software Engineering',
    contactCategory: 'Firmware/BSP',
    seoTitle: 'Embedded C/C++ Firmware and RTOS Development - Embedded India',
    seoDescription: 'Reliable, deterministic code engineered for ARM Cortex, RISC-V, ESP32, STM32, and PIC architectures with zero memory leaks.',
    description: 'Deterministic bare-metal and RTOS (FreeRTOS, Zephyr) drivers, HAL layers, low-power sleep management, and secure cryptographic bootloaders.',
    features: [
      {
        title: 'Bare-Metal Driver Architecture',
        description: 'Low-level peripheral register programming (SPI, I2C, UART, CAN, USB, PCIe), DMA circular buffering, and zero-copy data pipelines.'
      },
      {
        title: 'Real-Time Operating Systems (RTOS)',
        description: 'FreeRTOS, Zephyr, and ThreadX task synchronization, mutexes, semaphores, priority inversion prevention, and deterministic timing.'
      },
      {
        title: 'Secure Boot & Cryptographic Storage',
        description: 'Root of trust establishment, dual-bank A/B fail-safe rollback, ECDSA signature verification, and hardware crypto acceleration.'
      },
      {
        title: 'Ultra-Low Power Profiling',
        description: 'Dynamic voltage/frequency scaling, deep-sleep state management, tickless idle modes, and microamp current tuning.'
      },
      {
        title: 'Fail-Safe FOTA Updates',
        description: 'Over-The-Air firmware updates with delta compression, cryptographic integrity verification, and automatic rollback protection.'
      },
      {
        title: 'Code Auditing & Static Analysis',
        description: 'MISRA-C:2012 compliance checks, automated linting, unit testing with Unity/CMock, and automated CI/CD pipeline automation.'
      }
    ]
  },

  'hardware-design-engineering': {
    slug: 'hardware-design-engineering',
    title: 'Hardware Design & High-Speed PCB Layout',
    discipline: 'Hardware & RF Engineering',
    contactCategory: 'Hardware Design',
    seoTitle: 'Multi-layer PCB Layout and FPGA Hardware Engineering - Embedded India',
    seoDescription: 'Multi-layer PCB routing, high-speed signal integrity, HDI microvias, impedance matching, and pre-compliance EMC/EMI hardening.',
    description: 'Multi-layer layouts (up to 16+ layers), HDI microvias, controlled impedance traces, differential skew matching, and EMC/EMI pre-compliance.',
    features: [
      {
        title: 'High-Density Interconnect (HDI) Layouts',
        description: 'Laser-drilled blind and buried vias, microvias in pads, tight pitch BGA breakout (down to 0.4mm pitch), and stackup optimization.'
      },
      {
        title: 'High-Speed Signal Integrity (SI)',
        description: 'Controlled impedance calculation, differential pair phase matching, length tuning for DDR3/DDR4, PCIe Gen 3, and Gigabit Ethernet.'
      },
      {
        title: 'Power Integrity (PI) & Thermal Analysis',
        description: 'Decoupling capacitor placement, DC drop analysis, current density mapping, and thermal dissipation via copper planes and thermal vias.'
      },
      {
        title: 'Pre-Compliance EMC/EMI Hardening',
        description: 'Ferrite bead filtering, return path continuous planes, common-mode choke insertion, and shield enclosure grounding.'
      },
      {
        title: 'Precision Analog & Mixed-Signal',
        description: 'Low-noise operational amplifiers, 24-bit delta-sigma ADCs, galvanic isolation barriers, and guard ring routing.'
      },
      {
        title: 'Design for Manufacturing & Technical Documentation',
        description: 'Essential documentation includes IPC-7351 footprint validation, solder paste mask clearances, component spacing rules, and panelization design.'
      }
    ]
  },

  'bsp-development': {
    slug: 'bsp-development',
    title: 'Board Support Package (BSP) Development',
    discipline: 'Platform & Kernel Engineering',
    contactCategory: 'Firmware/BSP',
    seoTitle: 'Board Support Package (BSP) Development - Embedded India',
    seoDescription: 'Custom U-Boot bootloader porting, Embedded Linux device trees, custom peripheral drivers, and fail-safe FOTA updates for custom silicon.',
    description: 'Custom U-Boot bootloader porting, Embedded Linux device trees, custom peripheral drivers (I2C, SPI, CAN, PCIe), and fail-safe FOTA updates.',
    features: [
      {
        title: 'Bootloader Porting & Bring-Up',
        description: 'First-stage bootloader (SPL) configuration, U-Boot environment hardening, memory training, and secure boot authorization.'
      },
      {
        title: 'Embedded Linux Kernel Customization',
        description: 'Kernel configuration, device tree source (DTS) authoring, GPIO muxing, interrupt controllers, and custom driver implementation.'
      },
      {
        title: 'Custom Peripheral Driver Development',
        description: 'Linux kernel character and block device drivers, Industrial I/O (IIO) subsystem drivers, SPI/I2C/CAN bus interfaces.'
      },
      {
        title: 'Yocto Project & Buildroot Environments',
        description: 'Custom meta-layers, recipe authoring, minimal root filesystem images, SDK generation, and reproducible build systems.'
      },
      {
        title: 'Dual-Bank Fail-Safe FOTA',
        description: 'Robust dual-partition system updates (RAUC or SWUpdate), transactional rollback on boot failure, and watchdog recovery.'
      },
      {
        title: 'Power Management & Thermal Drivers',
        description: 'Linux CPUFreq governors, thermal throttling trip points, peripheral clock gating, and suspend-to-RAM sleep optimization.'
      }
    ]
  },

  'iot-edge-computing-solutions': {
    slug: 'iot-edge-computing-solutions',
    title: 'IoT and Edge Computing Solutions',
    discipline: 'Connected Systems & Edge AI',
    contactCategory: 'IoT Solutions',
    seoTitle: 'IoT and Edge Computing Solutions - Embedded India',
    seoDescription: 'Connected edge nodes with LoRaWAN, 4G/LTE-M, BLE 5.3, Wi-Fi 6, and on-device TinyML machine learning for real-time anomaly detection.',
    description: 'Connected sensors with LoRaWAN, Cellular (4G/LTE-M), BLE 5.3, Wi-Fi 6, and on-device TinyML machine learning for predictive vibration monitoring.',
    features: [
      {
        title: 'Wireless Protocol Implementation',
        description: 'Designing and deploying low-power wireless stacks (BLE, Wi-Fi, Zigbee, LoRaWAN, Cellular IoT, and MQTT/CoAP) for reliable device-to-cloud communication.'
      },
      {
        title: 'On-Device Edge AI & TinyML',
        description: 'TensorFlow Lite for Microcontrollers (TFLM) quantization, sensor fusion FFT processing, and vibration anomaly classification.'
      },
      {
        title: 'Ultra-Low Power Battery Engineering',
        description: 'Energy harvesting solutions, battery chemistry selection (LiSOCl2, LiFePO4), and multi-year field operational life modeling.'
      },
      {
        title: 'Cloud Telemetry & Protocol Translation',
        description: 'MQTT-SN, CoAP, and lightweight JSON/Protobuf telemetry over TLS 1.3 with AWS IoT Core and Azure IoT Hub connectors.'
      },
      {
        title: 'Edge Gateway Systems',
        description: 'Industrial protocol conversion (Modbus RTU/TCP, CAN 2.0B, RS-485, Profinet) to secure cloud pub/sub backbones.'
      },
      {
        title: 'Industrial Environmental Hardening',
        description: 'IP67/IP68 ingress-rated enclosure packaging, conformal coating specifications, and wide temperature (-40°C to +85°C) operation.'
      }
    ]
  },

  'automotive-embedded-systems': {
    slug: 'automotive-embedded-systems',
    title: 'Automotive Embedded Systems & HIL Testing',
    discipline: 'Automotive & Functional Safety',
    contactCategory: 'Automotive',
    seoTitle: 'Automotive Embedded Systems and HIL Verification - Embedded India',
    seoDescription: 'Automotive ECUs, CAN-FD / LIN bus networks, ISO 26262 functional safety compliance, and Hardware-in-the-Loop (HIL) automated test benches.',
    description: 'Automotive ECUs, CAN-FD / LIN buses, ISO 26262 functional safety compliance, and Hardware-in-the-Loop (HIL) automated test benches.',
    features: [
      {
        title: 'Automotive Electronic Control Units (ECUs)',
        description: 'Microcontroller architecture (Infineon AURIX, STM32H7, NXP S32K) for body controllers, motor drives, and telematics units.'
      },
      {
        title: 'In-Vehicle Network Engineering',
        description: 'CAN-FD (up to 5 Mbps), LIN 2.2, FlexRay, and Automotive Ethernet (100BASE-T1) stack implementation and message scheduling.'
      },
      {
        title: 'ISO 26262 Functional Safety (FuSa)',
        description: 'ASIL-B/D decomposition, safety manual development, hardware failure mode effect analysis (FMEDA), and diagnostic coverage.'
      },
      {
        title: 'Hardware-in-the-Loop (HIL) Test Rigs',
        description: 'Automated test bench development with programmable power supplies, relay load switches, CAN stress generators, and Python test runners.'
      },
      {
        title: 'Automotive Electrical Surge Protection',
        description: 'ISO 7637-2 and ISO 16750-2 transient compliance, load dump TVS suppression, reverse polarity protection, and cold crank ride-through.'
      },
      {
        title: 'Diagnostics & Telematics (UDS / OBD-II)',
        description: 'ISO 14229 Unified Diagnostic Services (UDS), DoIP (Diagnostics over IP), DTC logging, and secure diagnostic seed-key routines.'
      }
    ]
  },

  'embedded-ui-hmi-development': {
    slug: 'embedded-ui-hmi-development',
    title: 'Embedded UI for Industrial & Medical HMI',
    discipline: 'Embedded GUI & HMI Engineering',
    contactCategory: 'Embedded UI / HMI',
    seoTitle: 'TouchGFX (STM32 MCU) & Qt (MPU) Embedded HMI Development - Embedded India',
    seoDescription: 'Industrial and Medical Embedded UI / HMI engineering. Specializing in STMicroelectronics TouchGFX on STM32 MCUs and rich Qt / QML GUIs on Embedded Linux Microprocessors.',
    description: 'High-frame-rate, deterministic graphical user interfaces for Industrial and Medical HMIs — specializing in TouchGFX by STMicroelectronics on STM32 MCUs, alongside rich multi-display Qt / QML UIs on Microprocessors (MPUs).',
    features: [
      {
        title: 'TouchGFX on STM32 MCUs (Core Specialty)',
        description: 'Smartphone-grade 60 FPS GUIs on STM32U5, STM32H7, STM32F4/F7/G0 using Chrom-ART™ (DMA2D) and NeoChrom™ GPU vector hardware acceleration with sub-500ms instant boot and minimal RAM/Flash footprint.'
      },
      {
        title: 'Rich Qt / QML UI on Microprocessors (MPU)',
        description: 'Fluid 2D/3D multi-screen HMIs built with Qt 6 / QML on Embedded Linux (Yocto / Buildroot) for STM32MP1/MP2, NXP i.MX8/i.MX93, and TI Sitara AM62x with OpenGL ES & Vulkan hardware acceleration.'
      },
      {
        title: 'Medical HMI & IEC 62304 Compliance',
        description: 'Clinical-grade displays for patient monitors, infusion pumps, and diagnostic analyzers with IEC 62304 software lifecycle documentation, IEC 60601-1-8 alarm visual hierarchy, and fail-safe UI watchdogs.'
      },
      {
        title: 'Industrial Rugged PCAP & Display Bring-Up',
        description: 'Custom MIPI-DSI, LVDS, RGB, and SPI TFT/OLED panel bring-up, optical bonding guidance, and I2C capacitive touch controller tuning (Goodix, FocalTech, Ilitek) for thick-glove and water-droplet immunity.'
      },
      {
        title: 'C++ MVP Architecture & Real-Time Backend Binding',
        description: 'Strict Model-View-Presenter (MVP) separation binding TouchGFX or Qt views deterministically to FreeRTOS, ThreadX, Zephyr, or Linux IPC queues over CAN-FD, Modbus, and OPC-UA.'
      },
      {
        title: 'Asset Compression & External Flash Streaming',
        description: 'Octo-SPI / Quad-SPI XIP asset mapping, L8/RGB565/ARGB8888 framebuffer optimization, partial framebuffer rendering for zero-external-RAM MCUs, and multilingual vector typography.'
      }
    ]
  }
};

module.exports = servicesData;
