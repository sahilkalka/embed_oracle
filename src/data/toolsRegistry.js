// src/data/toolsRegistry.js
/**
 * Centralized Tools Registry for Embedded India Portal
 * Defines all 8 category hubs, tool rosters, SEO schemas, formulas, and FAQs.
 * Adding or moving any tool requires ONLY updating this registry.
 */

const TOOL_CATEGORIES = [
  {
    slug: 'engineering-hardware',
    title: 'Engineering & Hardware Utilities',
    shortTitle: 'Engineering & Hardware',
    badge: 'Hardware & Circuits',
    description: 'Precision calculators for PCB trace geometry, passive networks, RF microstrip impedance, and MCU peripherals based on IPC standards.',
    icon: `<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z"/></svg>`,
    color: 'emerald'
  },
  {
    slug: 'developer-formatters',
    title: 'Developer & Data Formatter Utilities',
    shortTitle: 'Developer & Formatters',
    badge: 'Dev Tools',
    description: 'Essential in-browser formatters, decoders, regex testers, and query beautifiers with zero server roundtrips.',
    icon: `<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"/></svg>`,
    color: 'sky'
  },
  {
    slug: 'financial-calculators',
    title: 'Financial & Business Calculators',
    shortTitle: 'Financial & Business',
    badge: 'Finance & ROI',
    description: 'Interactive compound growth, loan amortization, GST tax brackets, and freelance project rate estimators.',
    icon: `<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`,
    color: 'amber'
  },
  {
    slug: 'media-file-tools',
    title: 'Media & File Optimization',
    shortTitle: 'Media & Files',
    badge: 'Media & Canvas',
    description: 'Client-side image compression, SVG code cleansing, format conversion, and document metadata inspection without data uploads.',
    icon: `<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>`,
    color: 'violet'
  },
  {
    slug: 'generators-security',
    title: 'Generators & Security Scratchpads',
    shortTitle: 'Generators & Security',
    badge: 'Security & IDs',
    description: 'Cryptographically secure passphrases, UUID v4 bulk builders, customizable QR codes, and meta social tags.',
    icon: `<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>`,
    color: 'rose'
  },
  {
    slug: 'text-content-tools',
    title: 'Text & Content Analyzers',
    shortTitle: 'Text & Content',
    badge: 'Content & Analysis',
    description: 'Real-time string case transformations, split-pane Markdown previewer, word statistics, and visual text diff checkers.',
    icon: `<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>`,
    color: 'cyan'
  },
  {
    slug: 'unit-converters',
    title: 'Unit & Metric Converters',
    shortTitle: 'Unit Converters',
    badge: 'Physics & Units',
    description: 'Instant multi-unit conversion for digital data rates, electrical parameters, thermodynamics, and length/area scales.',
    icon: `<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"/></svg>`,
    color: 'teal'
  },
  {
    slug: 'seo-webmaster-tools',
    title: 'Webmaster & SEO Diagnostics',
    shortTitle: 'SEO & Webmaster',
    badge: 'SEO & Standards',
    description: 'Live social sharing previews, structured JSON-LD schema builder, HTTP status codes directory, and robots.txt syntax builders.',
    icon: `<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"/></svg>`,
    color: 'indigo'
  }
];

const TOOLS = [
  // ==========================================
  // GROUP 1: ENGINEERING & HARDWARE UTILITIES
  // ==========================================
  {
    slug: 'pcb-trace',
    groupSlug: 'engineering-hardware',
    title: 'IPC-2221 PCB Trace Width Calculator',
    shortTitle: 'Trace Width Calculator',
    subtitle: 'Conductor width, cross-section area, resistance, and temperature rise',
    description: 'Calculate required conductor width and current capacity according to IPC-2221 standards for internal and external PCB layers.',
    metaTitle: 'IPC-2221 PCB Trace Width Calculator | Conductor Sizing & Current Capacity',
    metaDescription: 'Calculate required minimum PCB trace width, resistance, voltage drop, and power dissipation based on standard IPC-2221 formulas for external and internal layers.',
    formulaBreakdown: `
      <p class="mb-3">The IPC-2221 trace width calculation is based on the empirical formula relating current, temperature rise, and cross-sectional area:</p>
      <div class="p-3 bg-slate-100 dark:bg-slate-800 rounded-xl font-mono text-xs text-brand-600 dark:text-accent mb-3">
        I = k &times; (&Delta;T)<sup>0.44</sup> &times; A<sup>0.725</sup>
      </div>
      <ul class="list-disc list-inside space-y-1 text-xs text-slate-600 dark:text-slate-300">
        <li><strong>I:</strong> Current in Amperes (A)</li>
        <li><strong>&Delta;T:</strong> Allowable temperature rise above ambient in &deg;C</li>
        <li><strong>A:</strong> Cross-sectional area in mils<sup>2</sup></li>
        <li><strong>k:</strong> Constant (0.048 for external layers, 0.024 for internal layers)</li>
        <li><strong>Width (W):</strong> W = Area / (Thickness &times; 1.378 mils/oz)</li>
      </ul>
    `,
    workedExample: `
      <p class="mb-2"><strong>Target:</strong> Carry 2.5A on an external layer with 1.0 oz copper and a 10&deg;C allowable temperature rise over a 50mm length.</p>
      <ol class="list-decimal list-inside space-y-1 text-xs text-slate-600 dark:text-slate-300">
        <li>Calculate cross-sectional area: A = (2.5 / (0.048 &times; 10<sup>0.44</sup>))<sup>(1/0.725)</sup> = 34.6 mils<sup>2</sup>.</li>
        <li>Convert 1.0 oz copper to thickness: 1.0 oz = 1.378 mils (35 &mu;m).</li>
        <li>Calculate required width: W = 34.6 mils<sup>2</sup> / 1.378 mils = <strong>25.1 mils (0.638 mm)</strong>.</li>
        <li>Resulting trace resistance over 50mm: R &approx; <strong>0.038 &Omega;</strong> with 0.095V voltage drop.</li>
      </ol>
    `,
    faqs: [
      {
        q: 'Why do internal layers require wider traces than external layers for the same current?',
        a: 'Internal layers are encapsulated within FR-4 dielectric epoxy glass, which is a poor thermal conductor (thermal conductivity ~0.3 W/m-K). External traces can dissipate heat through air convection and radiation, allowing them to carry approximately double the current for the same copper cross-section and temperature rise.'
      },
      {
        q: 'Should I use IPC-2152 or IPC-2221 for high-reliability boards?',
        a: 'IPC-2221 is based on legacy 1950s National Bureau of Standards tests on unclad boards, while IPC-2152 incorporates modern multi-layer thermal spreading effects, copper planes, and PCB thickness. For critical automotive or aerospace designs, IPC-2152 provides tighter, more conservative thermal predictions.'
      }
    ]
  },
  {
    slug: 'voltage-divider',
    groupSlug: 'engineering-hardware',
    title: 'Voltage Divider Calculator',
    shortTitle: 'Voltage Divider',
    subtitle: 'Loaded vs. unloaded output calculations and standard E24 resistor pairing',
    description: 'Calculate output voltage, resistor ratios, power dissipation, and loaded impedance effects for sensor and ADC front-ends.',
    metaTitle: 'Voltage Divider Calculator | Loaded & Unloaded Resistor Network Design',
    metaDescription: 'Interactive voltage divider calculator with loaded circuit analysis, standard E24/E96 resistor pairing, and thermal dissipation metrics.',
    formulaBreakdown: `
      <div class="p-3 bg-slate-100 dark:bg-slate-800 rounded-xl font-mono text-xs text-brand-600 dark:text-accent mb-3">
        V<sub>out (unloaded)</sub> = V<sub>in</sub> &times; [ R<sub>2</sub> / (R<sub>1</sub> + R<sub>2</sub>) ]<br>
        V<sub>out (loaded)</sub> = V<sub>in</sub> &times; [ (R<sub>2</sub> || R<sub>L</sub>) / (R<sub>1</sub> + (R<sub>2</sub> || R<sub>L</sub>)) ]
      </div>
    `,
    workedExample: `
      <p class="mb-2"><strong>Target:</strong> Step down 12V battery voltage to 3.3V ADC input on an STM32 with 10k&Omega; input impedance.</p>
      <ul class="list-disc list-inside space-y-1 text-xs text-slate-600 dark:text-slate-300">
        <li>Select R1 = 10 k&Omega;, R2 = 3.8 k&Omega; (nearest standard E24 = 3.9 k&Omega;).</li>
        <li>Unloaded Vout = 12 &times; (3.9 / (10 + 3.9)) = 3.367 V.</li>
        <li>With 100k ADC load: R2 || RL = 3.75 k&Omega; &rarr; Loaded Vout = 3.27 V.</li>
      </ul>
    `,
    faqs: [
      {
        q: 'How does load impedance affect divider output voltage?',
        a: 'Any load impedance connected across R2 sits in parallel with R2. If the load impedance is less than 10 to 100 times R2, significant voltage sag occurs. Buffer the divider with an operational amplifier voltage follower for high-impedance ADC inputs.'
      }
    ]
  },
  {
    slug: 'smd-code',
    groupSlug: 'engineering-hardware',
    title: 'SMD Resistor & Capacitor Code Decoder',
    shortTitle: 'SMD Code Decoder',
    subtitle: '3-digit, 4-digit, and EIA-96 precision resistor marking decoding',
    description: 'Decode 3-digit (5%), 4-digit (1%), and EIA-96 high-precision SMD resistor marking codes instantly with tolerance ratings.',
    metaTitle: 'SMD Resistor Code Decoder | 3-Digit, 4-Digit & EIA-96 Calculator',
    metaDescription: 'Decode SMD surface-mount resistor codes into accurate Ohms, tolerance, and multiplier values for 0402, 0603, 0805, and 1206 packages.',
    formulaBreakdown: `
      <p class="mb-2"><strong>3-Digit:</strong> First 2 digits = value, 3rd = 10<sup>n</sup> multiplier (e.g. 472 = 47 &times; 100 = 4.7 k&Omega;).</p>
      <p class="mb-2"><strong>4-Digit:</strong> First 3 digits = value, 4th = 10<sup>n</sup> multiplier (e.g. 1002 = 100 &times; 100 = 10 k&Omega;).</p>
      <p><strong>EIA-96:</strong> 2 digits represent significant digits from the EIA-96 lookup table, followed by a letter multiplier (A=1, B=10, C=100, D=1k, E=10k, F=100k, X=0.1, Y=0.01).</p>
    `,
    workedExample: `
      <p class="mb-2"><strong>Example: Code '01Y'</strong></p>
      <ul class="list-disc list-inside space-y-1 text-xs text-slate-600 dark:text-slate-300">
        <li>Lookup '01' in EIA-96 table = 100.</li>
        <li>Letter 'Y' represents multiplier 0.01.</li>
        <li>Resistance = 100 &times; 0.01 = <strong>1.00 &Omega; (1% tolerance)</strong>.</li>
      </ul>
    `,
    faqs: [
      {
        q: 'Why are some SMD resistors marked with an R (e.g., 4R7)?',
        a: 'The letter R serves as a decimal point for values under 10 Ohms to prevent confusion with tiny printed dots. For example, 4R7 equals 4.7 Ohms, and 0R22 equals 0.22 Ohms.'
      }
    ]
  },
  {
    slug: 'battery-life',
    groupSlug: 'engineering-hardware',
    title: 'IoT Battery Life & Runtime Estimator',
    shortTitle: 'Battery Life Estimator',
    subtitle: 'Battery capacity, active/sleep duty cycles, and operating lifespan',
    description: 'Calculate battery operating life for connected IoT nodes based on active/sleep current draw, duty cycles, and self-discharge rates.',
    metaTitle: 'IoT Battery Life Calculator | Standby & Active Duty Cycle Runtime Estimator',
    metaDescription: 'Estimate battery lifespan for ESP32, nRF52, STM32, and LoRaWAN IoT sensor nodes with real-world active and deep-sleep duty cycles.',
    formulaBreakdown: `
      <div class="p-3 bg-slate-100 dark:bg-slate-800 rounded-xl font-mono text-xs text-brand-600 dark:text-accent mb-3">
        I<sub>avg</sub> = (I<sub>active</sub> &times; T<sub>active</sub> + I<sub>sleep</sub> &times; T<sub>sleep</sub>) / (T<sub>active</sub> + T<sub>sleep</sub>)<br>
        Lifespan (hours) = (Capacity<sub>mAh</sub> &times; Derating) / I<sub>avg (mA)</sub>
      </div>
    `,
    workedExample: `
      <p class="mb-2"><strong>Target:</strong> BLE sensor reporting temperature every 60 seconds on a CR2032 (220 mAh) coin cell.</p>
      <ul class="list-disc list-inside space-y-1 text-xs text-slate-600 dark:text-slate-300">
        <li>Active current: 15 mA for 100 ms (0.1 s).</li>
        <li>Deep sleep current: 3.5 &mu;A (0.0035 mA) for 59.9 s.</li>
        <li>Average current: (15 &times; 0.1 + 0.0035 &times; 59.9) / 60 = 0.0285 mA (28.5 &mu;A).</li>
        <li>With 85% battery capacity derating: (220 &times; 0.85) / 0.0285 = 6,561 hours = <strong>273 days (~9 months)</strong>.</li>
      </ul>
    `,
    faqs: [
      {
        q: 'Why should I derate battery capacity for IoT designs?',
        a: 'Batteries degrade due to chemistry self-discharge (1-3% per year for lithium primaries), temperature extremes, and internal resistance causing voltage droop during high-current wireless transmission bursts. A 10-20% derating factor represents practical real-world capacity.'
      }
    ]
  },
  {
    slug: 'led-resistor',
    groupSlug: 'engineering-hardware',
    title: 'LED Series Resistor Calculator',
    shortTitle: 'LED Resistor',
    subtitle: 'Forward voltage drop, source voltage, and operating current calculation',
    description: 'Calculate exact and standard E12/E24 series resistor values, power dissipation, and safety wattage ratings for any LED circuit.',
    metaTitle: 'LED Series Resistor Calculator | Ohm\'s Law & Wattage Rating',
    metaDescription: 'Determine the correct series dropping resistor and power rating for LEDs across various colors, forward voltages, and supply rails.',
    formulaBreakdown: `
      <div class="p-3 bg-slate-100 dark:bg-slate-800 rounded-xl font-mono text-xs text-brand-600 dark:text-accent mb-3">
        R = (V<sub>source</sub> - V<sub>forward</sub>) / I<sub>LED</sub><br>
        P<sub>resistor</sub> = I<sub>LED</sub><sup>2</sup> &times; R = (V<sub>source</sub> - V<sub>forward</sub>) &times; I<sub>LED</sub>
      </div>
    `,
    workedExample: `
      <p class="mb-2"><strong>Target:</strong> Drive a high-brightness Blue LED (Vf = 3.2V, 20mA) from a 5V supply.</p>
      <ul class="list-disc list-inside space-y-1 text-xs text-slate-600 dark:text-slate-300">
        <li>Voltage drop across resistor: 5.0V - 3.2V = 1.8V.</li>
        <li>Ideal resistor: 1.8V / 0.020A = <strong>90 &Omega;</strong>.</li>
        <li>Standard E24 value: <strong>91 &Omega;</strong> (resulting in 19.8 mA current).</li>
        <li>Power dissipation: 1.8V &times; 0.0198A = 0.035W &rarr; use standard 0.125W (1/8W) or 0402 SMD resistor.</li>
      </ul>
    `,
    faqs: [
      {
        q: 'Can I connect multiple LEDs in parallel with a single resistor?',
        a: 'Connecting LEDs in parallel with a single current-limiting resistor is discouraged. Slight variations in forward voltage between LEDs will cause current hogging, where the LED with the lowest forward voltage draws excessive current, overheats, and burns out prematurely. Always use an individual resistor per branch.'
      }
    ]
  },
  {
    slug: '555-timer',
    groupSlug: 'engineering-hardware',
    title: '555 Timer Circuit Calculator',
    shortTitle: '555 Timer Calculator',
    subtitle: 'Astable & monostable frequency, duty cycle, and timing intervals',
    description: 'Calculate 555 timer output frequency, duty cycle, high/low times with interactive circuit diagram and live waveform rendering.',
    metaTitle: '555 Timer Circuit Calculator | Astable & Monostable Modes',
    metaDescription: 'Calculate 555 timer frequency, period, and duty cycles for astable oscillator and monostable pulse timer circuits.',
    formulaBreakdown: `
      <div class="p-3 bg-slate-100 dark:bg-slate-800 rounded-xl font-mono text-xs text-brand-600 dark:text-accent mb-3">
        Astable Frequency (f) = 1.44 / [ (R<sub>1</sub> + 2R<sub>2</sub>) &times; C ]<br>
        Duty Cycle = [ (R<sub>1</sub> + R<sub>2</sub>) / (R<sub>1</sub> + 2R<sub>2</sub>) ] &times; 100%<br>
        Monostable Pulse Width (T) = 1.1 &times; R &times; C
      </div>
    `,
    workedExample: `
      <p class="mb-2"><strong>Astable Example:</strong> R1 = 10 k&Omega;, R2 = 47 k&Omega;, C = 10 &mu;F.</p>
      <ul class="list-disc list-inside space-y-1 text-xs text-slate-600 dark:text-slate-300">
        <li>Period (T): 0.693 &times; (10k + 2&times;47k) &times; 10&mu;F = 0.7207 seconds.</li>
        <li>Frequency: 1 / 0.7207 = <strong>1.387 Hz</strong>.</li>
        <li>Duty Cycle: (10k + 47k) / (10k + 94k) = <strong>54.8%</strong>.</li>
      </ul>
    `,
    faqs: [
      {
        q: 'How can I get a 50% duty cycle on a standard 555 timer?',
        a: 'In a standard astable 555 timer, the duty cycle is always greater than 50% because C charges through R1+R2 and discharges through R2 only. To achieve a 50% or lower duty cycle, place a diode (like 1N4148) in parallel with R2 pointing towards the capacitor, so charging bypasses R2.'
      }
    ]
  },
  {
    slug: 'uart-baud',
    groupSlug: 'engineering-hardware',
    title: 'UART Baud Rate & Clock Error Calculator',
    shortTitle: 'UART Baud Calculator',
    subtitle: 'Compute microcontroller timer reload registers and framing error percentages',
    description: 'Compute microcontroller timer reload registers, actual baud rate, and framing error percentage across STM32, AVR, and 8051 architectures.',
    metaTitle: 'UART Baud Rate Calculator | Microcontroller Clock & Framing Error Analysis',
    metaDescription: 'Calculate actual baud rates, clock prescalers, register reload values, and allowable error margins across embedded MCU architectures.',
    formulaBreakdown: `
      <div class="p-3 bg-slate-100 dark:bg-slate-800 rounded-xl font-mono text-xs text-brand-600 dark:text-accent mb-3">
        Prescaler / Divisor = F<sub>clk</sub> / (16 &times; Baud<sub>target</sub>)<br>
        Actual Baud = F<sub>clk</sub> / (16 &times; Integer_Divisor)<br>
        Error (%) = [ (Actual Baud - Target Baud) / Target Baud ] &times; 100%
      </div>
    `,
    workedExample: `
      <p class="mb-2"><strong>Example:</strong> Target 115200 baud on an AVR running at 16 MHz.</p>
      <ul class="list-disc list-inside space-y-1 text-xs text-slate-600 dark:text-slate-300">
        <li>UBRR = (16,000,000 / (16 &times; 115200)) - 1 = 8.68 - 1 = 7.68 &rarr; Round to 8.</li>
        <li>Actual Baud = 16,000,000 / (16 &times; (8 + 1)) = 111,111 baud.</li>
        <li>Error = (111111 - 115200) / 115200 = <strong>-3.55%</strong> (marginal, may drop frames).</li>
        <li>Switching to double speed mode (U2X=1): Error drops to <strong>-1.4%</strong>.</li>
      </ul>
    `,
    faqs: [
      {
        q: 'What is the maximum tolerable UART clock error percentage?',
        a: 'Standard 8N1 UART frames tolerate a maximum clock mismatch of approximately &plusmn;2.5% across both communicating nodes. Beyond &plusmn;3%, the receiver sample point drifts past the stop bit margin, causing framing errors and corrupted bytes.'
      }
    ]
  },
  {
    slug: 'trace-impedance',
    groupSlug: 'engineering-hardware',
    title: 'Microstrip PCB Trace Impedance Calculator',
    shortTitle: 'Trace Impedance',
    subtitle: 'Characteristic impedance (Zo) for high-speed RF and digital microstrip lines',
    description: 'Calculate characteristic impedance (Zo) for high-speed microstrip traces on FR-4 substrates based on dielectric thickness and trace width.',
    metaTitle: 'PCB Microstrip Trace Impedance Calculator | 50 Ohm RF Matching',
    metaDescription: 'Calculate characteristic impedance Zo and effective dielectric constant for single-ended microstrip traces on multi-layer PCBs.',
    formulaBreakdown: `
      <div class="p-3 bg-slate-100 dark:bg-slate-800 rounded-xl font-mono text-xs text-brand-600 dark:text-accent mb-3">
        Z<sub>0</sub> = [ 87 / &radic;(&epsilon;<sub>r</sub> + 1.41) ] &times; ln[ (5.98 &times; H) / (0.8 &times; W + T) ]
      </div>
    `,
    workedExample: `
      <p class="mb-2"><strong>Target:</strong> 50 &Omega; microstrip on standard 1.6mm 4-layer FR-4 board (&epsilon;r = 4.4, dielectric height H = 0.2mm to layer 2 plane, 1 oz copper T = 0.035mm).</p>
      <ul class="list-disc list-inside space-y-1 text-xs text-slate-600 dark:text-slate-300">
        <li>Solving for Z0 = 50 &Omega; gives trace width W &approx; <strong>0.38 mm (15 mils)</strong>.</li>
      </ul>
    `,
    faqs: [
      {
        q: 'Why is 50 Ohms the universal standard for RF and high-speed traces?',
        a: 'In 1930s coaxial cable research, 30 Ohms delivered maximum power handling, while 77 Ohms minimized signal attenuation. 50 Ohms was selected as the optimal engineering compromise between power handling and insertion loss.'
      }
    ]
  },
  {
    slug: 'mcu-pinout',
    groupSlug: 'engineering-hardware',
    title: 'Interactive MCU Pinout Reference',
    shortTitle: 'MCU Pinouts',
    subtitle: 'ESP32, STM32 Blue Pill, and Raspberry Pi Pico GPIO cheat sheets',
    description: 'Quick interactive pinout cheat sheets for popular embedded microcontrollers: ESP32-WROOM-32, STM32F103 Blue Pill, and Raspberry Pi Pico.',
    metaTitle: 'Interactive Microcontroller Pinout Reference | ESP32, STM32, RP2040',
    metaDescription: 'Visual pinout diagrams and GPIO capability matrices for ESP32, STM32 Blue Pill, and RP2040 Raspberry Pi Pico.',
    formulaBreakdown: `<p class="text-xs text-slate-600 dark:text-slate-300">Hardware pin allocation matrix highlighting strapping pins, PWM channels, SPI, I2C, and ADC channels.</p>`,
    workedExample: `<p class="text-xs text-slate-600 dark:text-slate-300">Select pin functions dynamically to verify bootloader strapping pin conflicts on ESP32 (GPIO 0, 2, 12, 15).</p>`,
    faqs: [
      {
        q: 'Which ESP32 pins are input-only?',
        a: 'GPIOs 34, 35, 36 (VP), and 39 (VN) are input-only pins without internal software pull-up or pull-down resistors. They are ideal for analog sensors.'
      }
    ]
  },

  // ==========================================
  // GROUP 2: DEVELOPER & DATA FORMATTER UTILITIES
  // ==========================================
  {
    slug: 'json-formatter',
    groupSlug: 'developer-formatters',
    title: 'JSON Formatter & Validator',
    shortTitle: 'JSON Formatter',
    subtitle: 'Beautify, minify, validate, and inspect JSON structures locally',
    description: 'Beautify, minify, validate, and tree-view nested JSON data with syntax error diagnosis and instant clipboard copy.',
    metaTitle: 'JSON Formatter & Validator | Beautify, Minify & Inspect JSON Online',
    metaDescription: 'Free in-browser JSON formatter, validator, and minifier with real-time error detection and zero server data transfers.',
    formulaBreakdown: `<p class="text-xs text-slate-600 dark:text-slate-300">Parses strings via client-side <code>JSON.parse()</code> and serializes with custom indentation spaces (2, 4, or minified compact).</p>`,
    workedExample: `<p class="text-xs text-slate-600 dark:text-slate-300">Format unformatted telemetry JSON payloads from MQTT brokers into human-readable indented structures.</p>`,
    faqs: [
      {
        q: 'Does my JSON data get sent to any server?',
        a: 'No. All JSON formatting, parsing, and syntax validation runs 100% locally in your web browser using client-side JavaScript. Your sensitive configuration files or API keys never leave your machine.'
      }
    ]
  },
  {
    slug: 'base64-converter',
    groupSlug: 'developer-formatters',
    title: 'Base64 Encoder / Decoder',
    shortTitle: 'Base64 Converter',
    subtitle: 'Text and binary string encoding/decoding with UTF-8 safety',
    description: 'Convert plain text and hexadecimal binary strings to Base64 and decode Base64 back into clear text with UTF-8 encoding support.',
    metaTitle: 'Base64 Encoder & Decoder | UTF-8 Safe Online String Converter',
    metaDescription: 'Encode and decode Base64 strings with full UTF-8 Unicode character support and instant copy functionality.',
    formulaBreakdown: `<p class="text-xs text-slate-600 dark:text-slate-300">Converts 8-bit binary octets into 6-bit chunks mapped to the 64 ASCII character alphabet (A-Z, a-z, 0-9, +, /) with '=' padding.</p>`,
    workedExample: `<p class="text-xs text-slate-600 dark:text-slate-300">Input "Embedded India" &rarr; Base64 encoded: <code>RW1iZWRkZWQgSW5kaWE=</code>.</p>`,
    faqs: [
      {
        q: 'Why does Base64 encoding increase string size?',
        a: 'Base64 uses 4 ASCII characters to represent every 3 bytes of raw binary data. This introduces a predictable ~33% overhead in payload transmission size.'
      }
    ]
  },
  {
    slug: 'regex-tester',
    groupSlug: 'developer-formatters',
    title: 'Regex Tester & Debugger',
    shortTitle: 'Regex Tester',
    subtitle: 'Real-time JavaScript regex matching with capture group inspection',
    description: 'Test and debug regular expressions in real-time with visual match highlighting, capture group extraction, and flag toggling.',
    metaTitle: 'Regex Tester & Debugger | Real-Time JavaScript RegExp Matcher',
    metaDescription: 'Interactive JavaScript regex tester with live match highlighting, capture group table, and global/multiline flags.',
    formulaBreakdown: `<p class="text-xs text-slate-600 dark:text-slate-300">Evaluates expressions using standard ECMAScript RegExp engine with flags <code>g</code>, <code>i</code>, <code>m</code>, <code>s</code>.</p>`,
    workedExample: `<p class="text-xs text-slate-600 dark:text-slate-300">Test MAC address pattern <code>^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$</code> against ESP32 BLE MAC strings.</p>`,
    faqs: [
      {
        q: 'What is the difference between global (/g) and sticky (/y) regex flags?',
        a: 'The global flag (/g) searches for all occurrences throughout the target string, whereas the sticky flag (/y) matches only at the current lastIndex position without scanning forward.'
      }
    ]
  },
  {
    slug: 'jwt-decoder',
    groupSlug: 'developer-formatters',
    title: 'JWT Token Decoder',
    shortTitle: 'JWT Decoder',
    subtitle: 'Decode JSON Web Token header, payload, and verify expiration dates',
    description: 'Inspect JSON Web Tokens (JWT) client-side. Decodes claims, issued-at dates, expiry times, and token algorithm headers safely.',
    metaTitle: 'JWT Decoder Online | Decode JSON Web Token Header & Claims',
    metaDescription: 'Inspect and decode JWT authentication tokens safely in-browser with automated expiration timestamp validation.',
    formulaBreakdown: `<p class="text-xs text-slate-600 dark:text-slate-300">Splits the dot-separated string into Header, Payload, and Signature components, decoding each base64url segment.</p>`,
    workedExample: `<p class="text-xs text-slate-600 dark:text-slate-300">Decode OAuth tokens to verify role claims and whether <code>exp</code> timestamp is still valid.</p>`,
    faqs: [
      {
        q: 'Is it safe to paste JWT tokens into this tool?',
        a: 'Yes, this decoder is purely client-side and never sends your token over the internet. However, never paste production private keys or long-lived authentication tokens into untrusted public computers.'
      }
    ]
  },
  {
    slug: 'sql-formatter',
    groupSlug: 'developer-formatters',
    title: 'SQL Query Formatter',
    shortTitle: 'SQL Formatter',
    subtitle: 'Clean indentation and keyword capitalization for SQL dialects',
    description: 'Format, indent, and beautify messy SQL queries with uppercase keyword conventions for PostgreSQL, MySQL, and SQLite.',
    metaTitle: 'SQL Formatter & Beautifier | Clean SQL Indentation Online',
    metaDescription: 'Format and beautify complex SQL SELECT, JOIN, and UPDATE queries with consistent keyword capitalization and indentation.',
    formulaBreakdown: `<p class="text-xs text-slate-600 dark:text-slate-300">Tokenizes SQL clauses (SELECT, FROM, WHERE, JOIN, GROUP BY) and formats query blocks with 2-space indentation.</p>`,
    workedExample: `<p class="text-xs text-slate-600 dark:text-slate-300">Transforms compact queries into cleanly separated lines with capitalized keywords.</p>`,
    faqs: [
      {
        q: 'Which SQL dialects are supported?',
        a: 'The formatter uses standard ANSI SQL tokenization, making it compatible with SQLite, PostgreSQL, MySQL, MariaDB, and Microsoft SQL Server.'
      }
    ]
  },

  // ==========================================
  // GROUP 3: FINANCIAL & BUSINESS CALCULATORS
  // ==========================================
  {
    slug: 'compound-interest-sip',
    groupSlug: 'financial-calculators',
    title: 'Compound Interest & SIP Growth Calculator',
    shortTitle: 'SIP & Compound Interest',
    subtitle: 'Dynamic growth visualizer with monthly contribution modeling',
    description: 'Calculate wealth accumulation with periodic monthly contributions (SIP), annual interest rates, and compounding frequency.',
    metaTitle: 'Compound Interest & SIP Calculator | Mutual Fund Investment Growth',
    metaDescription: 'Simulate long-term wealth growth, total invested capital, and compounding returns with monthly SIP contributions.',
    formulaBreakdown: `
      <div class="p-3 bg-slate-100 dark:bg-slate-800 rounded-xl font-mono text-xs text-brand-600 dark:text-accent mb-3">
        A = P &times; (1 + r/n)<sup>nt</sup> + PMT &times; [ ((1 + r/n)<sup>nt</sup> - 1) / (r/n) ]
      </div>
    `,
    workedExample: `
      <p class="mb-2"><strong>Example:</strong> &dollar;500 monthly SIP for 10 years at an expected 12% annual return compounded monthly.</p>
      <ul class="list-disc list-inside space-y-1 text-xs text-slate-600 dark:text-slate-300">
        <li>Total Invested: &dollar;500 &times; 120 months = &dollar;60,000.</li>
        <li>Estimated Maturity Value: <strong>&dollar;116,170</strong> (Capital growth = &dollar;56,170).</li>
      </ul>
    `,
    faqs: [
      {
        q: 'What is the Rule of 72 in compound interest?',
        a: 'The Rule of 72 is a quick mental math shortcut: divide 72 by your expected annual rate of return to estimate how many years it will take to double your investment. At 12% annual return, your money doubles approximately every 6 years (72 / 12 = 6).'
      }
    ]
  },
  {
    slug: 'emi-loan-calculator',
    groupSlug: 'financial-calculators',
    title: 'EMI & Loan Repayment Calculator',
    shortTitle: 'Loan EMI Calculator',
    subtitle: 'Monthly installment breakdown, total interest payable, and amortization schedule',
    description: 'Calculate Equated Monthly Installments (EMI), total interest payable, and full payment breakdown for equipment and business loans.',
    metaTitle: 'EMI & Loan Repayment Calculator | Monthly Installment Breakdown',
    metaDescription: 'Calculate monthly loan EMI payments, total interest payable, and repayment ratios with interactive sliders.',
    formulaBreakdown: `
      <div class="p-3 bg-slate-100 dark:bg-slate-800 rounded-xl font-mono text-xs text-brand-600 dark:text-accent mb-3">
        EMI = [ P &times; r &times; (1 + r)<sup>n</sup> ] / [ (1 + r)<sup>n</sup> - 1 ]
      </div>
    `,
    workedExample: `
      <p class="mb-2"><strong>Example:</strong> &dollar;100,000 lab equipment loan at 8.5% annual interest for 5 years (60 months).</p>
      <ul class="list-disc list-inside space-y-1 text-xs text-slate-600 dark:text-slate-300">
        <li>Monthly rate: 8.5% / 12 = 0.7083%.</li>
        <li>Monthly EMI = <strong>&dollar;2,051.65</strong>.</li>
        <li>Total payment = &dollar;123,099 (Total interest = &dollar;23,099).</li>
      </ul>
    `,
    faqs: [
      {
        q: 'How does prepaying a loan reduce total interest?',
        a: 'Prepayments are applied directly to the loan principal. Since monthly interest is calculated against the remaining principal balance, paying down principal early significantly accelerates loan payoff and saves thousands in cumulative interest.'
      }
    ]
  },
  {
    slug: 'gst-calculator',
    groupSlug: 'financial-calculators',
    title: 'GST & Sales Tax Calculator',
    shortTitle: 'GST / Tax Calculator',
    subtitle: 'Inclusive and exclusive tax calculations with customizable rate brackets',
    description: 'Calculate Goods and Services Tax (GST) or VAT for net-to-gross and gross-to-net invoices across standard tax slabs.',
    metaTitle: 'GST & Sales Tax Calculator | Inclusive & Exclusive Tax Slabs',
    metaDescription: 'Quickly compute inclusive and exclusive GST amounts across 5%, 12%, 18%, and 28% tax rates for professional electronics invoicing.',
    formulaBreakdown: `
      <div class="p-3 bg-slate-100 dark:bg-slate-800 rounded-xl font-mono text-xs text-brand-600 dark:text-accent mb-3">
        GST Exclusive: Total = Net + (Net &times; Rate%)<br>
        GST Inclusive: Net = Gross / (1 + Rate%), Tax = Gross - Net
      </div>
    `,
    workedExample: `
      <p class="mb-2"><strong>Example:</strong> &dollar;10,000 engineering consultation at 18% GST.</p>
      <ul class="list-disc list-inside space-y-1 text-xs text-slate-600 dark:text-slate-300">
        <li>GST Exclusive: Tax = &dollar;1,800 &rarr; Total Invoice = <strong>&dollar;11,800</strong>.</li>
        <li>If &dollar;10,000 is Inclusive: Net = &dollar;10,000 / 1.18 = <strong>&dollar;8,474.58</strong> &rarr; Tax = &dollar;1,525.42.</li>
      </ul>
    `,
    faqs: [
      {
        q: 'What is the standard GST rate for electronics engineering services in India?',
        a: 'Professional engineering consultancy, firmware architecture, and hardware design services are categorized under SAC 9983 and taxed at the standard 18% GST rate (9% CGST + 9% SGST for intrastate, or 18% IGST for interstate).'
      }
    ]
  },
  {
    slug: 'freelance-rate-calculator',
    groupSlug: 'financial-calculators',
    title: 'Freelance & Consultant Hourly Rate Estimator',
    shortTitle: 'Freelance Rate Estimator',
    subtitle: 'Overhead, billable hours, target savings, and minimum hourly pricing calculator',
    description: 'Calculate your true minimum hourly billing rate based on annual target income, taxes, operating overhead, and billable utilization.',
    metaTitle: 'Freelance Hourly Rate Calculator | Consultant Pricing Estimator',
    metaDescription: 'Calculate the exact hourly and daily rate needed to meet your salary and profit targets as an independent engineer or contractor.',
    formulaBreakdown: `
      <div class="p-3 bg-slate-100 dark:bg-slate-800 rounded-xl font-mono text-xs text-brand-600 dark:text-accent mb-3">
        Billable Hours/Yr = (52 wks - Vacation - Sick) &times; Billable Hrs/Wk<br>
        Hourly Rate = (Target Net Income + Taxes + Overhead) / Billable Hours
      </div>
    `,
    workedExample: `
      <p class="mb-2"><strong>Target:</strong> &dollar;100,000 take-home income, &dollar;15,000 overhead, 25% taxes, 4 weeks off, 25 billable hours/wk.</p>
      <ul class="list-disc list-inside space-y-1 text-xs text-slate-600 dark:text-slate-300">
        <li>Total Required Gross = (&dollar;100k / 0.75) + &dollar;15k = &dollar;148,333.</li>
        <li>Billable Hours = 48 weeks &times; 25 hours = 1,200 hours/yr.</li>
        <li>Minimum Hourly Rate = &dollar;148,333 / 1,200 = <strong>&dollar;123.61 / hour</strong>.</li>
      </ul>
    `,
    faqs: [
      {
        q: 'Why shouldn\'t I base my rate on 40 billable hours per week?',
        a: 'Freelancers and consultants spend 30-50% of their working hours on non-billable administrative tasks: marketing, invoicing, scoping client RFQs, accounting, and technical skill development. 20 to 28 billable hours per week is a healthy, sustainable benchmark.'
      }
    ]
  },

  // ==========================================
  // GROUP 4: MEDIA & FILE OPTIMIZATION
  // ==========================================
  {
    slug: 'image-compressor',
    groupSlug: 'media-file-tools',
    title: 'Client-Side Image Compressor',
    shortTitle: 'Image Compressor',
    subtitle: 'Browser-based JPEG/PNG compression using HTML5 Canvas API without server upload',
    description: 'Compress JPEG and PNG photos directly in your browser using the HTML5 Canvas API. Reduce payload size with zero data upload.',
    metaTitle: 'Client-Side Image Compressor | In-Browser JPEG & PNG Optimization',
    metaDescription: 'Fast, secure in-browser image compression with zero server upload. Reduce photo byte size while preserving visual fidelity.',
    formulaBreakdown: `<p class="text-xs text-slate-600 dark:text-slate-300">Loads local image files via <code>FileReader</code>, renders onto an offscreen <code>HTMLCanvasElement</code>, and compresses with <code>toBlob(..., quality)</code>.</p>`,
    workedExample: `<p class="text-xs text-slate-600 dark:text-slate-300">Drop high-resolution 4K PCB assembly photos (~8MB) and compress to ~450KB for fast web documentation.</p>`,
    faqs: [
      {
        q: 'Are my confidential board photos uploaded to any third-party server?',
        a: 'No. All image resizing, canvas drawing, and compression algorithms execute entirely within your browser runtime using the native HTML5 Canvas API.'
      }
    ]
  },
  {
    slug: 'image-converter',
    groupSlug: 'media-file-tools',
    title: 'Image Format Converter',
    shortTitle: 'Image Converter',
    subtitle: 'Instant in-browser conversion between PNG, JPG, and WebP',
    description: 'Convert images between PNG, JPEG, and WebP formats instantly with client-side canvas rendering and 1-click download.',
    metaTitle: 'Image Format Converter Online | Convert PNG, JPG & WebP in Browser',
    metaDescription: 'Convert images to modern WebP, PNG, or JPEG formats with zero server upload and high image clarity.',
    formulaBreakdown: `<p class="text-xs text-slate-600 dark:text-slate-300">Extracts bitmap pixels via canvas context and encodes to target MIME type: <code>image/webp</code>, <code>image/png</code>, or <code>image/jpeg</code>.</p>`,
    workedExample: `<p class="text-xs text-slate-600 dark:text-slate-300">Convert heavy PNG diagrams into modern WebP images with a 70% file size reduction.</p>`,
    faqs: [
      {
        q: 'Why should I convert website images to WebP?',
        a: 'WebP is supported by all modern browsers and provides 25-35% superior compression compared to JPEG and PNG at equivalent visual quality, improving Core Web Vitals and page load speed.'
      }
    ]
  },
  {
    slug: 'svg-optimizer',
    groupSlug: 'media-file-tools',
    title: 'SVG Path & Code Optimizer',
    shortTitle: 'SVG Optimizer',
    subtitle: 'Clean SVG markup, strip editor bloat, and reduce floating precision',
    description: 'Minify SVG vector graphics, strip Inkscape/Illustrator metadata, remove comments, and reduce decimal precision to shrink file size.',
    metaTitle: 'SVG Code Optimizer & Minifier | Strip Metadata & Clean Vectors',
    metaDescription: 'Clean and minify SVG vector files client-side. Remove useless XML tags, editor namespaces, and optimize coordinate precision.',
    formulaBreakdown: `<p class="text-xs text-slate-600 dark:text-slate-300">Parses XML DOM, strips non-standard attributes and namespaces, trims whitespace, and limits path coordinates to 2 decimal places.</p>`,
    workedExample: `<p class="text-xs text-slate-600 dark:text-slate-300">Shrink complex schematic symbol SVGs from 45KB down to 12KB for inline HTML rendering.</p>`,
    faqs: [
      {
        q: 'Does SVG minification degrade vector quality?',
        a: 'No. Standard optimization retains the exact visual shapes while stripping useless editor metadata (like Illustrator guides) and rounding microscopic sub-pixel coordinates.'
      }
    ]
  },
  {
    slug: 'pdf-tools',
    groupSlug: 'media-file-tools',
    title: 'PDF Metadata Viewer & Inspector',
    shortTitle: 'PDF Inspector',
    subtitle: 'Inspect page count, title, producer, encryption, and document metadata',
    description: 'Analyze PDF documents in your browser. Inspect title, author, creator software, PDF version, and page count without uploading.',
    metaTitle: 'PDF Metadata Viewer & Document Inspector | Online PDF Analyzer',
    metaDescription: 'Inspect PDF document properties, author, creation timestamp, and page count in-browser with zero file upload.',
    formulaBreakdown: `<p class="text-xs text-slate-600 dark:text-slate-300">Reads binary PDF trailer dictionaries and cross-reference tables locally to extract Info dictionary keys.</p>`,
    workedExample: `<p class="text-xs text-slate-600 dark:text-slate-300">Verify manufacturer datasheet revisions, PDF version compatibility, and author credits.</p>`,
    faqs: [
      {
        q: 'Are confidential PDF schematics safe in this viewer?',
        a: 'Yes, files are processed strictly in local browser memory using ArrayBuffer binary readers. Nothing is stored or transmitted.'
      }
    ]
  },

  // ==========================================
  // GROUP 5: GENERATORS & SECURITY SCRATCHPADS
  // ==========================================
  {
    slug: 'qr-generator',
    groupSlug: 'generators-security',
    title: 'QR Code Generator',
    shortTitle: 'QR Code Generator',
    subtitle: 'Custom URL and text QR code generator with SVG/PNG download',
    description: 'Generate customizable, high-resolution QR codes for URLs, Wi-Fi credentials, and contact cards with instant SVG and PNG export.',
    metaTitle: 'QR Code Generator Online | Free Custom QR Codes with SVG/PNG Export',
    metaDescription: 'Create clean, high-resolution QR codes for websites, Wi-Fi networks, and text strings with instant client-side download.',
    formulaBreakdown: `<p class="text-xs text-slate-600 dark:text-slate-300">Encodes alphanumeric strings into 2D Reed-Solomon error-corrected matrix modules with configurable correction levels (L, M, Q, H).</p>`,
    workedExample: `<p class="text-xs text-slate-600 dark:text-slate-300">Generate a Wi-Fi setup QR code formatted as <code>WIFI:T:WPA;S:MySSID;P:MyPassword;;</code> for automatic phone pairing.</p>`,
    faqs: [
      {
        q: 'Which QR error correction level is best for physical PCB silkscreen printing?',
        a: 'Level H (High, 30% recovery) or Level Q (Quartile, 25% recovery) is strongly recommended for silkscreen printing. It ensures the QR code remains readable even if solder flux, component shadows, or minor scratches obscure part of the pattern.'
      }
    ]
  },
  {
    slug: 'password-generator',
    groupSlug: 'generators-security',
    title: 'Secure Password & Passphrase Generator',
    shortTitle: 'Password Generator',
    subtitle: 'Cryptographic entropy, character pool customization, and memorable passphrases',
    description: 'Generate high-entropy passwords and memorable multi-word passphrases using the browser’s cryptographically secure pseudo-random number generator (CSPRNG).',
    metaTitle: 'Secure Password & Passphrase Generator | High-Entropy CSPRNG',
    metaDescription: 'Generate strong, uncrackable passwords and EFF-style passphrases using browser crypto.getRandomValues().',
    formulaBreakdown: `<p class="text-xs text-slate-600 dark:text-slate-300">Entropy (bits) = L &times; log<sub>2</sub>(N), where L = length and N = character pool size (e.g. 94 characters for full ASCII printable).</p>`,
    workedExample: `<p class="text-xs text-slate-600 dark:text-slate-300">A 20-character password using letters, numbers, and symbols delivers <strong>~131 bits of entropy</strong>, requiring billions of years to brute-force.</p>`,
    faqs: [
      {
        q: 'Why is crypto.getRandomValues() safer than Math.random()?',
        a: 'Math.random() is a pseudo-random PRNG designed for speed, not security, and its internal seed state can be mathematically deduced. crypto.getRandomValues() draws from operating system cryptographic entropy pools.'
      }
    ]
  },
  {
    slug: 'uuid-generator',
    groupSlug: 'generators-security',
    title: 'UUID / GUID v4 Generator',
    shortTitle: 'UUID Generator',
    subtitle: 'Bulk generation of RFC 4122-compliant unique identifiers',
    description: 'Generate cryptographically random RFC 4122 Version 4 UUIDs in bulk with hyphenated, uppercase, or raw hexadecimal formatting.',
    metaTitle: 'UUID v4 Generator | Bulk RFC 4122 GUID Generator Online',
    metaDescription: 'Generate random UUID v4 identifiers in bulk for database keys, IoT device IDs, and distributed message tracking.',
    formulaBreakdown: `<p class="text-xs text-slate-600 dark:text-slate-300">Generates 128-bit random values, setting bits 48-51 to <code>0100</code> (Version 4) and bits 64-65 to <code>10</code> (Variant 1).</p>`,
    workedExample: `<p class="text-xs text-slate-600 dark:text-slate-300">Format: <code>xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx</code> where y is 8, 9, A, or B.</p>`,
    faqs: [
      {
        q: 'What is the probability of a UUID v4 collision?',
        a: 'The total number of possible UUID v4 values is 2^122 &approx; 5.3 &times; 10^36. To have a 50% chance of a single collision, you would need to generate 2.7 quintillion UUIDs.'
      }
    ]
  },
  {
    slug: 'meta-tag-generator',
    groupSlug: 'generators-security',
    title: 'Meta Tag & Social Card Generator',
    shortTitle: 'Meta Tag Generator',
    subtitle: 'HTML <head> tags and Open Graph / Twitter card snippets with real-time preview',
    description: 'Generate search-engine optimized HTML meta tags, Open Graph properties, and Twitter Card markup with real-time preview simulation.',
    metaTitle: 'Meta Tag & Social Card Generator | SEO & Open Graph Markup Builder',
    metaDescription: 'Create complete HTML meta tags for Google SEO, Facebook Open Graph, and Twitter Cards with copyable code snippets.',
    formulaBreakdown: `<p class="text-xs text-slate-600 dark:text-slate-300">Builds semantic HTML tags: <code>&lt;title&gt;</code>, <code>&lt;meta name="description"&gt;</code>, <code>og:title</code>, <code>og:image</code>, and <code>twitter:card</code>.</p>`,
    workedExample: `<p class="text-xs text-slate-600 dark:text-slate-300">Fills title, description, and canonical URL to produce complete copy-paste head markup.</p>`,
    faqs: [
      {
        q: 'What is the optimal image size for Open Graph cards?',
        a: 'The recommended dimensions for <code>og:image</code> are 1200 &times; 630 pixels (1.91:1 aspect ratio), with a maximum file size under 5MB.'
      }
    ]
  },

  // ==========================================
  // GROUP 6: TEXT & CONTENT ANALYZERS
  // ==========================================
  {
    slug: 'word-counter',
    groupSlug: 'text-content-tools',
    title: 'Word & Character Counter',
    shortTitle: 'Word Counter',
    subtitle: 'Real-time character, word, sentence, reading time, and speaking time counters',
    description: 'Count words, characters, sentences, paragraphs, reading time, and speaking duration in real-time with density metrics.',
    metaTitle: 'Word & Character Counter Online | Real-Time Text Length & Reading Time',
    metaDescription: 'Free real-time word counter, character counter (with and without spaces), paragraph count, and estimated reading duration.',
    formulaBreakdown: `<p class="text-xs text-slate-600 dark:text-slate-300">Word count uses regex tokenization <code>/\b\S+\b/g</code>; reading time is based on 225 words per minute average reading speed.</p>`,
    workedExample: `<p class="text-xs text-slate-600 dark:text-slate-300">A 900-word engineering whitepaper takes ~4.0 minutes to read and ~6.9 minutes to speak aloud.</p>`,
    faqs: [
      {
        q: 'What is the optimal meta description character length for Google SEO?',
        a: 'Google generally truncates search snippets around 155 to 160 characters on desktop and approximately 120 characters on mobile devices.'
      }
    ]
  },
  {
    slug: 'case-converter',
    groupSlug: 'text-content-tools',
    title: 'String Case Converter',
    shortTitle: 'Case Converter',
    subtitle: 'Transform between camelCase, snake_case, kebab-case, PascalCase, and Title Case',
    description: 'Batch convert text and variable names between camelCase, snake_case, kebab-case, PascalCase, CONSTANT_CASE, and Title Case.',
    metaTitle: 'String Case Converter | camelCase, snake_case & PascalCase Tool',
    metaDescription: 'Convert text and code variables between camelCase, snake_case, kebab-case, PascalCase, and UPPERCASE instantly.',
    formulaBreakdown: `<p class="text-xs text-slate-600 dark:text-slate-300">Splits strings on transitions, underscores, hyphens, and whitespace, applying case formatting rules.</p>`,
    workedExample: `<p class="text-xs text-slate-600 dark:text-slate-300">Input: "embedded hardware design" &rarr; camelCase: <code>embeddedHardwareDesign</code> &rarr; snake_case: <code>embedded_hardware_design</code>.</p>`,
    faqs: [
      {
        q: 'Which naming convention is standard in C firmware vs JavaScript?',
        a: 'Embedded C traditionally uses <code>snake_case</code> for functions and variables with <code>UPPER_SNAKE_CASE</code> for preprocessor macros. JavaScript and TypeScript favor <code>camelCase</code> for functions/variables and <code>PascalCase</code> for classes.'
      }
    ]
  },
  {
    slug: 'text-diff',
    groupSlug: 'text-content-tools',
    title: 'Text Diff & Comparison Checker',
    shortTitle: 'Text Diff Checker',
    subtitle: 'Visual side-by-side highlight of insertions, deletions, and modifications',
    description: 'Compare two text snippets side-by-side or inline. Highlights additions, deletions, and line-by-line differences with precision.',
    metaTitle: 'Text Diff Checker | Side-by-Side Text Comparison Online',
    metaDescription: 'Compare two text files or code snippets side-by-side with visual highlights of differences, additions, and deletions.',
    formulaBreakdown: `<p class="text-xs text-slate-600 dark:text-slate-300">Computes the Longest Common Subsequence (LCS) to generate unified and side-by-side diff blocks.</p>`,
    workedExample: `<p class="text-xs text-slate-600 dark:text-slate-300">Compare firmware config files before and after modifications to confirm register changes.</p>`,
    faqs: [
      {
        q: 'How does the diff algorithm treat trailing whitespace?',
        a: 'The comparison checker allows toggling whitespace sensitivity so you can ignore accidental trailing spaces or indentation differences.'
      }
    ]
  },
  {
    slug: 'markdown-previewer',
    groupSlug: 'text-content-tools',
    title: 'Markdown Live Editor & Previewer',
    shortTitle: 'Markdown Previewer',
    subtitle: 'Split-pane editor converting GitHub-flavored Markdown to sanitized HTML',
    description: 'Write, format, and preview GitHub-flavored Markdown in a synchronized dual-pane editor with live HTML rendering and code export.',
    metaTitle: 'Markdown Live Editor & Previewer | GitHub-Flavored Markdown',
    metaDescription: 'Interactive split-pane Markdown editor with live preview, syntax highlighting, and clean HTML code generation.',
    formulaBreakdown: `<p class="text-xs text-slate-600 dark:text-slate-300">Transforms Markdown syntax into sanitized HTML supporting tables, code blocks, lists, and task checklists.</p>`,
    workedExample: `<p class="text-xs text-slate-600 dark:text-slate-300">Author README.md documentation and preview GitHub table formatting in real-time.</p>`,
    faqs: [
      {
        q: 'Is the output HTML sanitized against XSS attacks?',
        a: 'Yes. All generated HTML is sanitized through DOMPurify client-side before being injected into the preview pane.'
      }
    ]
  },

  // ==========================================
  // GROUP 7: UNIT & METRIC CONVERTERS
  // ==========================================
  {
    slug: 'data-storage-converter',
    groupSlug: 'unit-converters',
    title: 'Digital Storage & Bandwidth Converter',
    shortTitle: 'Data & Bandwidth',
    subtitle: 'Bytes, KB, MB, GB, TB, and transfer speed conversions (Mbps to MB/s)',
    description: 'Convert digital storage capacities (decimal vs. binary powers) and network transfer rates (Megabits/sec to MegaBytes/sec).',
    metaTitle: 'Digital Storage & Bandwidth Converter | Bits, Bytes & Mbps Calculator',
    metaDescription: 'Convert between Bytes, Kilobytes, Megabytes, Gigabytes, and calculate real download transfer durations.',
    formulaBreakdown: `
      <div class="p-3 bg-slate-100 dark:bg-slate-800 rounded-xl font-mono text-xs text-brand-600 dark:text-accent mb-3">
        1 Byte = 8 Bits &bull; 1 KB = 1000 Bytes (SI) vs 1 KiB = 1024 Bytes (Binary)<br>
        Transfer Time = File Size in Megabits / Network Speed in Mbps
      </div>
    `,
    workedExample: `
      <p class="mb-2"><strong>Example:</strong> Transferring a 16MB SPI flash firmware binary over a 4G LTE connection (20 Mbps).</p>
      <ul class="list-disc list-inside space-y-1 text-xs text-slate-600 dark:text-slate-300">
        <li>16 Megabytes = 16 &times; 8 = 128 Megabits.</li>
        <li>Time = 128 Mb / 20 Mbps = <strong>6.4 seconds</strong> (excluding protocol handshake overhead).</li>
      </ul>
    `,
    faqs: [
      {
        q: 'What is the difference between MB and MiB?',
        a: 'MB (Megabyte) is based on decimal powers (10^6 = 1,000,000 bytes) used by storage drive manufacturers. MiB (Mebibyte) is based on binary powers (2^20 = 1,048,576 bytes) used by operating systems and memory addressing.'
      }
    ]
  },
  {
    slug: 'electrical-converter',
    groupSlug: 'unit-converters',
    title: 'Electrical Units Converter',
    shortTitle: 'Electrical Units',
    subtitle: 'Watts, Volts, Amperes, Ohms, and Henrys/Farads unit scaling',
    description: 'Convert electrical units across metric prefixes from pico, nano, micro, and milli up to kilo, mega, and giga for RLC circuits.',
    metaTitle: 'Electrical Units Converter | Farads, Henrys, Ohms & Microvolts',
    metaDescription: 'Scale and convert electrical capacitance, inductance, resistance, voltage, and current across standard engineering prefixes.',
    formulaBreakdown: `<p class="text-xs text-slate-600 dark:text-slate-300">Scales base SI units (F, H, &Omega;, V, A, W) by powers of 10<sup>-12</sup> (pico) through 10<sup>9</sup> (giga).</p>`,
    workedExample: `<p class="text-xs text-slate-600 dark:text-slate-300">Convert 100 nF capacitor = 0.1 &mu;F = 100,000 pF.</p>`,
    faqs: [
      {
        q: 'Why are ceramic capacitors frequently labeled in pF on schematics?',
        a: 'Picofarads (pF) and nanofarads (nF) represent common decoupling values in high-frequency designs, making pF standard in RF and bypass engineering.'
      }
    ]
  },
  {
    slug: 'temp-pressure-converter',
    groupSlug: 'unit-converters',
    title: 'Temperature & Pressure Converter',
    shortTitle: 'Temp & Pressure',
    subtitle: 'Celsius, Fahrenheit, Kelvin, PSI, Bar, and Pascals',
    description: 'Convert temperatures between Celsius, Fahrenheit, and Kelvin, and pressure units between Bar, PSI, Pascals, and Atmospheres.',
    metaTitle: 'Temperature & Pressure Converter | Celsius, Fahrenheit, PSI & Bar',
    metaDescription: 'Convert industrial temperature and pressure units for environmental sensors and thermal dissipation modeling.',
    formulaBreakdown: `
      <div class="p-3 bg-slate-100 dark:bg-slate-800 rounded-xl font-mono text-xs text-brand-600 dark:text-accent mb-3">
        &deg;F = (&deg;C &times; 9/5) + 32 &bull; K = &deg;C + 273.15<br>
        1 Bar = 100,000 Pa = 14.5038 PSI
      </div>
    `,
    workedExample: `
      <p class="mb-2"><strong>Example:</strong> Automotive sensor operating temperature 125&deg;C (AEC-Q100 Grade 1).</p>
      <ul class="list-disc list-inside space-y-1 text-xs text-slate-600 dark:text-slate-300">
        <li>125&deg;C = <strong>257&deg;F</strong> = <strong>398.15 K</strong>.</li>
        <li>Tire pressure 32 PSI = <strong>2.206 Bar</strong> = 220.6 kPa.</li>
      </ul>
    `,
    faqs: [
      {
        q: 'What is absolute zero?',
        a: 'Absolute zero is 0 Kelvin (-273.15&deg;C or -459.67&deg;F), the theoretical thermodynamic temperature at which all classical atomic thermal motion ceases.'
      }
    ]
  },
  {
    slug: 'length-area-converter',
    groupSlug: 'unit-converters',
    title: 'Length, Area & Volume Converter',
    shortTitle: 'Length, Area & Volume',
    subtitle: 'Imperial to metric unit conversions (mils, mm, inches, sq cm)',
    description: 'Convert dimensions between metric and imperial systems with PCB units like mils, inches, millimeters, and microns.',
    metaTitle: 'Length, Area & Volume Converter | Mils, Millimeters & Inches',
    metaDescription: 'Convert lengths, areas, and volumes between mils, millimeters, inches, square centimeters, and cubic centimeters.',
    formulaBreakdown: `
      <div class="p-3 bg-slate-100 dark:bg-slate-800 rounded-xl font-mono text-xs text-brand-600 dark:text-accent mb-3">
        1 mil = 0.001 inch = 0.0254 mm = 25.4 &mu;m &bull; 1 mm = 39.37 mils
      </div>
    `,
    workedExample: `
      <p class="mb-2"><strong>Example:</strong> Convert standard 100-mil pin header pitch to metric.</p>
      <ul class="list-disc list-inside space-y-1 text-xs text-slate-600 dark:text-slate-300">
        <li>100 mils = 100 &times; 0.0254 mm = <strong>2.54 mm pitch</strong>.</li>
        <li>0.5mm BGA ball pitch = 0.5 &times; 39.37 = <strong>19.68 mils</strong>.</li>
      </ul>
    `,
    faqs: [
      {
        q: 'What is a "mil" in PCB fabrication?',
        a: 'A mil is a thousandth of an inch (0.001 inch or 25.4 microns). It is commonly used in North America for PCB trace widths, clearances, and pin pitch dimensions.'
      }
    ]
  },

  // ==========================================
  // GROUP 8: WEBMASTER & SEO DIAGNOSTICS
  // ==========================================
  {
    slug: 'open-graph-previewer',
    groupSlug: 'seo-webmaster-tools',
    title: 'Open Graph & Social Share Previewer',
    shortTitle: 'Social Share Previewer',
    subtitle: 'Simulates how a URL displays when shared on LinkedIn, X, and Facebook',
    description: 'Preview how your articles, tools, and landing pages render when shared across LinkedIn, Twitter/X, and Facebook feeds.',
    metaTitle: 'Open Graph & Social Share Previewer | Test Meta Image Previews',
    metaDescription: 'Test and preview social sharing card previews for LinkedIn, Twitter, and Facebook with real-time mockup cards.',
    formulaBreakdown: `<p class="text-xs text-slate-600 dark:text-slate-300">Renders simulated feed viewports using your title, description, and preview image URL.</p>`,
    workedExample: `<p class="text-xs text-slate-600 dark:text-slate-300">Test article preview to ensure headlines aren't cropped mid-sentence on mobile Twitter cards.</p>`,
    faqs: [
      {
        q: 'Why does LinkedIn or Facebook show an outdated thumbnail image?',
        a: 'Social networks cache scraped metadata for several days. Use LinkedIn\'s Post Inspector or Facebook\'s Sharing Debugger to invalidate their cache and re-crawl your updated tags.'
      }
    ]
  },
  {
    slug: 'schema-generator',
    groupSlug: 'seo-webmaster-tools',
    title: 'JSON-LD Schema Markup Generator',
    shortTitle: 'Schema Generator',
    subtitle: 'Interactive form generating valid WebSite, Organization, or FAQPage schemas',
    description: 'Generate structured JSON-LD data for Organization, SoftwareApplication, WebSite, and FAQPage schemas with 1-click script export.',
    metaTitle: 'JSON-LD Schema Markup Generator | Rich Snippets SEO Tool',
    metaDescription: 'Generate valid Schema.org JSON-LD markup for organizations, tools, and FAQ pages to earn rich Google search results.',
    formulaBreakdown: `<p class="text-xs text-slate-600 dark:text-slate-300">Constructs valid Schema.org JSON-LD scripts conforming to Google Structured Data Guidelines.</p>`,
    workedExample: `<p class="text-xs text-slate-600 dark:text-slate-300">Fill organization details to output a structured <code>&lt;script type="application/ld+json"&gt;</code> snippet.</p>`,
    faqs: [
      {
        q: 'Where should I place JSON-LD schema on my webpage?',
        a: 'Google recommends placing the <code>&lt;script type="application/ld+json"&gt;</code> block within the <code>&lt;head&gt;</code> section of your HTML document, though it also functions correctly within the <code>&lt;body&gt;</code>.'
      }
    ]
  },
  {
    slug: 'http-status-codes',
    groupSlug: 'seo-webmaster-tools',
    title: 'HTTP Status Code Reference & Debugger',
    shortTitle: 'HTTP Status Codes',
    subtitle: 'Searchable guide for 1xx, 2xx, 3xx, 4xx, and 5xx status codes with debugging notes',
    description: 'Searchable reference directory of all standard HTTP response status codes with developer explanations, caching behaviors, and troubleshooting tips.',
    metaTitle: 'HTTP Status Code Reference & Guide | 1xx to 5xx Debugging',
    metaDescription: 'Searchable HTTP response codes reference guide covering 200 OK, 301 Redirect, 400 Bad Request, 404, 410 Gone, and 500 Server Errors.',
    formulaBreakdown: `<p class="text-xs text-slate-600 dark:text-slate-300">Standard RFC 9110 HTTP response classification (1xx Informational, 2xx Success, 3xx Redirection, 4xx Client Error, 5xx Server Error).</p>`,
    workedExample: `<p class="text-xs text-slate-600 dark:text-slate-300">Verify differences between 301 Moved Permanently (cachable) vs 302 Found (temporary).</p>`,
    faqs: [
      {
        q: 'What is the SEO difference between a 404 Not Found and a 410 Gone?',
        a: 'A 404 tells search engines that a page is currently missing, prompting them to re-check later in case it returns. A 410 Gone explicitly tells crawlers the resource has been permanently removed, removing it from search indexes faster.'
      }
    ]
  },
  {
    slug: 'robots-sitemap-builder',
    groupSlug: 'seo-webmaster-tools',
    title: 'Robots.txt & Sitemap Syntax Builder',
    shortTitle: 'Robots.txt Builder',
    subtitle: 'Rule generator for crawler bot indexing permissions with copyable syntax',
    description: 'Build valid robots.txt directives and XML sitemap index references with user-agent rules, disallow paths, and crawl delays.',
    metaTitle: 'Robots.txt & Sitemap Syntax Builder | Web Crawler Directives',
    metaDescription: 'Create clean, valid robots.txt rules for Googlebot, Bingbot, and AI crawlers with instant preview and copy.',
    formulaBreakdown: `<p class="text-xs text-slate-600 dark:text-slate-300">Follows the Robots Exclusion Protocol (RFC 9309) with <code>User-agent</code>, <code>Allow</code>, <code>Disallow</code>, and <code>Sitemap</code> lines.</p>`,
    workedExample: `<p class="text-xs text-slate-600 dark:text-slate-300">Generate rules to allow public tools and blogs while disallowing <code>/admin/</code> and <code>/tmp/</code> paths.</p>`,
    faqs: [
      {
        q: 'Does robots.txt guarantee that private pages won\'t be indexed?',
        a: 'No. Robots.txt prevents crawling, not indexing. If another website links to a disallowed URL, Google may still index the bare URL without content. Use <code>&lt;meta name="robots" content="noindex"&gt;</code> or HTTP authentication for true privacy.'
      }
    ]
  }
];

// Helper methods for clean modular access
function getAllCategories() {
  return TOOL_CATEGORIES.map(cat => {
    const tools = TOOLS.filter(t => t.groupSlug === cat.slug);
    return {
      ...cat,
      tools,
      toolCount: tools.length
    };
  });
}

function getCategoryBySlug(slug) {
  const cat = TOOL_CATEGORIES.find(c => c.slug === slug);
  if (!cat) return null;
  const tools = TOOLS.filter(t => t.groupSlug === cat.slug);
  return {
    ...cat,
    tools,
    toolCount: tools.length
  };
}

function getToolBySlug(toolSlug) {
  return TOOLS.find(t => t.slug === toolSlug) || null;
}

function getLegacyRedirect(oldSlug) {
  // Check if oldSlug directly matches a tool
  const tool = TOOLS.find(t => t.slug === oldSlug);
  if (tool) {
    return { groupSlug: tool.groupSlug, toolSlug: tool.slug };
  }
  return null;
}

module.exports = {
  TOOL_CATEGORIES,
  TOOLS,
  getAllCategories,
  getCategoryBySlug,
  getToolBySlug,
  getLegacyRedirect
};

