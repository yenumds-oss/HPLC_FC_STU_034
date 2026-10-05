const $ = id => document.getElementById(id);
const trials = [];
const deletedSuggestions = new Set();
let currentViewedTrialIndex = null;
let parameterTrialIndex = null;
let activeEquipmentModule = "";
let activeEquipmentParameter = "";
let activeInjectorImage = "manual";
function logDebug(label, value) {
  const output = $("debugLog");
  if (!output) return;
  if (output.textContent.startsWith("Upload a run")) output.textContent = "";
  output.textContent += `${label}\n${typeof value === "string" ? value : JSON.stringify(value, null, 2)}\n\n`;
}
const parameterLabels = [
  ["Ligand", "ligand"], ["Column Type", "columnType"], ["Coreshell Present", "coreShell"],
  ["Pore Size (Å)", "poreSize"], ["C-Load (%)", "cLoad"], ["Column Length (mm)", "length"],
  ["Column Internal Diameter (mm)", "diameter"], ["Particle Size (μm)", "particleSize"],
  ["Solvent Type", "solvent"], ["%B", "percentB"], ["Flow Rate (mL/minute)", "flow"],
  ["Sample Concentration (mg/mL)", "sampleConc"], ["Set Temp (°C)", "setTemperature"],
  ["Measured Temp (°C)", "measuredTemperature"],
  ["Wavelength (nm)", "wavelength"]
];
const editableParameterNumberKeys = new Set([
  "length", "diameter", "particleSize", "percentB",
  "flow", "sampleConc", "setTemperature", "measuredTemperature", "wavelength"
]);
const MINIMUM_INTERMEDIATE_NOT_ENOUGH_RUNS = "NA% (Not Enough Runs to Calculate Min %B/Intermediate %B)";
// EQUIPMENT REFERENCE LOOKUP:
// Static, module-specific explanations support the Equipment interface only.
// Leave numeric admissible ranges blank unless the supplied method notes specify them.
const equipmentModules = {
  solventBottles: {
    title: "Solvent Bottles",
    category: "Composition",
    function: "Stores and supplies the solvents used to prepare the mobile phase. Solvent selection and composition determine the mobile phase delivered to the column and, when buffers are used, contribute to the method pH.",
    description: "Bottles sit above the instrument and connect through individual lines. Select a parameter below to see what to adjust and what chromatographic change to expect.",
    parameters: [
      {
        name: "Solvent Type",
        dataKey: "solvent",
        function: "Selects which solvent each bottle line supplies for mixing with water or another mobile-phase solvent.",
        category: "Composition",
        controlPoint: "Bench setup: solvent bottles and lines. Software: method solvent/line selection.",
        units: "Not applicable",
        admissibleRange: "Not specified in the available method notes.",
        typicalRange: "Common HPLC solvents include water, acetonitrile, methanol, and ethanol.",
        retentionEffect: "At the same %B, solvents can have different elution strengths. A stronger or weaker solvent may require a different %B to produce similar retention.",
        selectivityEffect: "Changing solvent changes mobile-phase/analyte interactions and can alter peak spacing and elution order.",
        efficiencyEffect: "",
        otherEffects: "Solvent viscosity affects system back-pressure. If the mobile phase is buffered, confirm that the chosen solvent and pH are compatible with the column.",
        whyChange: "Change solvent when the current solvent/%B combination cannot meet retention targets, or when a different selectivity is needed to resolve peaks.",
        recommendationWhen: "The decision flow can advance to a solvent-change stage after the sequential %B options at the preceding conditions have been tried."
      },
      {
        name: "%B (Mobile-phase composition)",
        dataKey: "percentB",
        valueUnit: "%",
        function: "Sets the proportion of solvent B in the mobile phase. In reversed-phase methods, solvent B is commonly the organic solvent.",
        category: "Composition",
        controlPoint: "Initial preparation of solvent bottles and composition; the instrument method records which solvent lines are used and the %B setting.",
        units: "%",
        admissibleRange: "0–100%.",
        typicalRange: "0–100%, as specified by the method.",
        retentionEffect: "Changes mobile-phase elution strength and polarity. Increasing organic %B in a typical reversed-phase method generally decreases retention; decreasing %B generally increases retention.",
        selectivityEffect: "Composition can change analyte ionisation and mobile-phase interactions. pH/composition shifts can change peak spacing and may reorder peaks.",
        efficiencyEffect: "",
        otherEffects: "For buffered mobile phases, pH and temperature can affect ionisation. Keep pH within the column's stability limits.",
        whyChange: "Adjust %B to move the last peak toward the maximum-run-time target while retaining the required peaks.",
        recommendationWhen: "When peak count is below target and a further 10-point decrease is predicted to remain within the maximum run time, the decision engine recommends decreasing %B. If that decrease would exceed the time limit, it moves to the calculated Minimum %B and Intermediate %B options."
      }
    ]
  },
  degasser: {
    title: "Degasser",
    category: "Mobile-phase preparation",
    function: "Removes dissolved gases through vacuum-held, gas-permeable tubing before the solvent reaches the pump.",
    description: "The degasser runs automatically and is not a separation control. It stabilises flow and detector baseline; it does not remove air bubbles already in the line, which require purging.",
    parameters: [
      {
        name: "Operational role (not user-adjustable)",
        function: "Removes dissolved gas to help maintain steady solvent delivery and a stable detector baseline.",
        category: "Mobile-phase preparation",
        controlPoint: "Automatic while the instrument is on. Check degasser status/vacuum; purge bubbles separately.",
        units: "Not applicable",
        admissibleRange: "Not applicable.",
        typicalRange: "Not applicable.",
        retentionEffect: "No direct effect; unstable delivery can reduce retention-time repeatability.",
        selectivityEffect: "No direct effect.",
        efficiencyEffect: "No direct effect; bubbles or unstable flow can make peak measurements unreliable.",
        otherEffects: "Failure signs include unsteady flow, a wandering baseline, and random chromatogram spikes.",
        whyChange: "Check or service it only to restore stable operation, not to tune the separation.",
        recommendationWhen: "Not recommended by the decision engine. Troubleshoot if flow or baseline is unstable; purge trapped bubbles."
      }
    ]
  },
  pump: {
    title: "Pump",
    category: "Mobile phase and flow",
    function: "Delivers mobile phase through the HPLC system at a controlled flow rate and composition.",
    description: "A dual-reciprocating pump delivers the mobile phase. Solvents may be mixed before or after the pump, depending on the instrument; the purge/drain valve must be closed for flow to reach the column.",
    parameters: [
      {
        name: "Flow Rate",
        dataKey: "flow",
        valueUnit: " mL/min",
        function: "Sets mobile-phase volume delivered through the column per unit time.",
        category: "Flow",
        controlPoint: "Instrument method: pump flow-rate setting.",
        units: "mL/min",
        admissibleRange: "Instrument-specific. Keep pressure below the lower of the instrument and column ratings; this project also checks a 4000 psi method limit.",
        typicalRange: "1.0 mL/min is cited for a 4.6 mm column; the supplied runs used 1.5 mL/min. Confirm the method and hardware limits.",
        retentionEffect: "Typically decreases retention time as the mobile phase moves through the column faster.",
        selectivityEffect: "Little or no direct effect on selectivity or elution order. Flow is not a co-elution remedy.",
        efficiencyEffect: "Efficiency depends on linear velocity (Van Deemter behaviour); flow far from the column optimum broadens peaks.",
        otherEffects: "Pressure rises with flow. Check that the purge/drain valve is closed and pressure is stable.",
        whyChange: "Adjust run time or reduce pressure only while preserving required resolution.",
        recommendationWhen: "The engine may recommend increasing flow when retention is within the time limit and resolution meets specification."
      },
      {
        name: "%B (Pump composition setting)",
        dataKey: "percentB",
        valueUnit: "%",
        function: "Sets the organic-solvent fraction delivered by the pump; it may be constant (isocratic) or programmed as a gradient.",
        category: "Mobile phase / Composition",
        controlPoint: "Instrument method: isocratic %B setting or programmed solvent composition.",
        units: "%",
        admissibleRange: "0–100%.",
        typicalRange: "About 40–80% B is the working range in the supplied unit method; it is not a universal limit.",
        retentionEffect: "In reversed-phase methods, lower organic %B generally raises k′ and lengthens retention; higher %B lowers both.",
        selectivityEffect: "Can change pairwise spacing because compounds respond differently; changing solvent identity or pH may have a larger effect.",
        efficiencyEffect: "Little direct effect on plate number.",
        otherEffects: "Lower %B can increase viscosity and pressure. Very low %B may push late peaks beyond the run-time window.",
        whyChange: "Tune retention and resolution while checking run time and pressure.",
        recommendationWhen: "The engine steps %B down, then uses calculated minimum/intermediate values when another decrease is not suitable."
      },
      {
        name: "Pressure Limit",
        dataKey: "pressure",
        valueUnit: " psi",
        currentValueLabel: "Observed back-pressure in selected run",
        function: "Sets a protective pump cut-off. Measured back-pressure is a system response, not a retention control.",
        category: "System protection",
        controlPoint: "Instrument method or pump settings.",
        units: "psi",
        admissibleRange: "Set no higher than the lower instrument/column rating. The hardware ratings are not specified in the supplied notes.",
        typicalRange: "The project method uses a 4000 psi back-pressure threshold; this is not a universal equipment rating.",
        retentionEffect: "No direct retention adjustment.",
        selectivityEffect: "No direct selectivity adjustment.",
        efficiencyEffect: "No direct efficiency adjustment.",
        otherEffects: "High pressure may indicate high viscosity, flow, or a blockage; near-zero pressure may indicate a leak or open purge valve.",
        whyChange: "Protect the system and investigate unexpected pressure changes.",
        recommendationWhen: "The tool compares measured pressure with the method specification; it does not recommend a pump cut-off setting."
      }
    ]
  },
  columnOven: {
    title: "Column/Column Oven",
    category: "Stationary phase and temperature",
    function: "The column provides the stationary phase for sample compounds to interact with and separate. The column oven maintains the column at a controlled temperature.",
    description: "The packed column is where separation occurs; the oven stabilises column temperature. Column attributes come from its data sheet, while temperature is set in the instrument method.",
    parameters: [
      {
        name: "Ligand (Stationary phase)",
        dataKey: "ligand",
        function: "Identifies the bonded stationary-phase chemistry (for example, C18) that interacts with analytes.",
        category: "Stationary phase",
        controlPoint: "Column selection / installed column.",
        units: "Chemistry/name",
        admissibleRange: "Use a column chemistry compatible with the analytes, mobile phase, and pH. No universal numeric range.",
        typicalRange: "Method-specific. The current run's ligand is shown in Run Analysis when available.",
        retentionEffect: "Ligand chemistry determines analyte interaction strength and retention.",
        selectivityEffect: "Changing ligand can strongly alter pairwise spacing and elution order.",
        efficiencyEffect: "A suitable stationary phase can improve peak shape and separation quality; efficiency also depends on packing and operating conditions.",
        otherEffects: "Confirm solvent and pH compatibility with the column.",
        whyChange: "Consider another ligand when the existing solvent, %B, and temperature stages do not provide the required separation.",
        recommendationWhen: "The staged flow considers ligand changes only after the prescribed solvent and temperature stages remain below the peak target."
      },
      {
        name: "Bead Type",
        function: "Identifies particle construction (for example, fully porous or core-shell) supporting the stationary phase.",
        category: "Column characteristics",
        controlPoint: "Column selection / installed column.",
        units: "Type/name",
        admissibleRange: "Column-specific; not specified in the available notes.",
        typicalRange: "Use the bead type stated for the installed column.",
        retentionEffect: "Porous particles generally provide more stationary-phase surface and retention than solid particles of the same size.",
        selectivityEffect: "Usually less direct than ligand or mobile-phase changes.",
        efficiencyEffect: "Core-shell construction shortens diffusion paths and can improve efficiency.",
        otherEffects: "Construction can affect pressure and loading capacity; verify the column data sheet.",
        whyChange: "Consider a different bead construction when more efficiency is needed without a longer column.",
        recommendationWhen: "The Stage 3 guidance may consider a bead-type change when resolution is low and run time allows."
      },
      {
        name: "Coreshell Present",
        dataKey: "coreShell",
        function: "Indicates whether particles have a solid core surrounded by a porous shell.",
        category: "Column characteristics",
        controlPoint: "Column selection / installed column.",
        units: "Yes/No",
        admissibleRange: "Yes or No, according to the installed column.",
        typicalRange: "Column-specific.",
        retentionEffect: "Often slightly lower than fully porous particles of the same diameter because less stationary phase is present.",
        selectivityEffect: "Little direct effect; it is not a primary chemical-selectivity control.",
        efficiencyEffect: "Shorter diffusion paths can improve efficiency, often without the pressure of sub-2 μm particles.",
        otherEffects: "Core-shell columns may have lower sample-loading capacity.",
        whyChange: "This is a fixed column choice, not an in-run setting.",
        recommendationWhen: "The decision engine does not independently recommend a core-shell change."
      },
      {
        name: "Pore Size",
        dataKey: "poreSize",
        valueUnit: " Å",
        function: "Describes particle-pore dimensions and the accessible surface area for analyte interaction.",
        category: "Column characteristics",
        controlPoint: "Column selection / installed column.",
        units: "Å",
        admissibleRange: "Use the manufacturer's column data sheet.",
        typicalRange: "140 Å is the supplied Pinnacle example; confirm the installed column specification.",
        retentionEffect: "Larger pores provide less surface area and generally lower retention; smaller pores provide more.",
        selectivityEffect: "Little direct effect for the small analytes in the supplied method.",
        efficiencyEffect: "Pores too small for an analyte can restrict diffusion and broaden peaks.",
        otherEffects: "Choose pore size to suit analyte dimensions.",
        whyChange: "Change only when selecting a column suitable for analyte access.",
        recommendationWhen: "The decision engine does not independently recommend a pore-size change."
      },
      {
        name: "Carbon Load",
        dataKey: "cLoad",
        valueUnit: "%",
        function: "Records carbon mass fraction, an indicator of bonded-phase coverage on the packing.",
        category: "Column characteristics",
        controlPoint: "Column selection / installed column.",
        units: "%",
        admissibleRange: "Use the manufacturer's column data sheet.",
        typicalRange: "The 6% value in the notes is an example, not a verified value for every column.",
        retentionEffect: "Higher carbon load generally means more bonded phase and higher retention.",
        selectivityEffect: "Little direct effect.",
        efficiencyEffect: "Lower coverage leaves more free silanols, which can contribute to peak tailing.",
        otherEffects: "A fixed column property, not a normal run-to-run adjustment.",
        whyChange: "Compare column phases only when stationary-phase interaction strength needs optimisation.",
        recommendationWhen: "The decision engine does not independently recommend a carbon-load change."
      },
      {
        name: "Column Length",
        dataKey: "length",
        valueUnit: " mm",
        function: "Sets the packed-bed path length and the number of plates available for separation.",
        category: "Column characteristics",
        controlPoint: "Column selection / installed column.",
        units: "mm",
        admissibleRange: "Column-specific; not specified in the available notes.",
        typicalRange: "Use the dimensions of the installed column.",
        retentionEffect: "Retention time and t0 scale with column length; retention factor k′ is unchanged.",
        selectivityEffect: "Does not usually change intrinsic selectivity, but can improve the observed separation of nearby peaks by providing more separation distance.",
        efficiencyEffect: "Plate number increases with length; resolution rises approximately with the square root of plate number.",
        otherEffects: "Pressure and run time increase with length.",
        whyChange: "Trade additional time and pressure for more resolution.",
        recommendationWhen: "Stage 3 may consider lengthening for low resolution with time margin, or shortening when run time is excessive."
      },
      {
        name: "Column Internal Diameter",
        dataKey: "diameter",
        valueUnit: " mm",
        function: "Sets the internal width of the column bore.",
        category: "Column characteristics",
        controlPoint: "Column selection / installed column.",
        units: "mm",
        admissibleRange: "Column-specific; not specified in the available notes.",
        typicalRange: "Use the dimensions of the installed column.",
        retentionEffect: "A narrower bore shortens t0 and retention time at the same flow; k′ is unchanged.",
        selectivityEffect: "Does not directly change intrinsic selectivity.",
        efficiencyEffect: "Excess extra-column volume can broaden peaks, especially with narrow-bore columns.",
        otherEffects: "Smaller ID raises linear velocity and pressure at fixed flow; scale flow approximately with ID squared.",
        whyChange: "Change for scale or sensitivity, not as a first-line selectivity adjustment.",
        recommendationWhen: "The decision engine does not currently recommend changing column internal diameter."
      },
      {
        name: "Particle Size",
        dataKey: "particleSize",
        valueUnit: " μm",
        function: "Sets the size of the particles packed inside the column.",
        category: "Column characteristics",
        controlPoint: "Column selection / installed column.",
        units: "μm",
        admissibleRange: "Column-specific; not specified in the available notes.",
        typicalRange: "Use the particle size stated for the installed column.",
        retentionEffect: "Does not normally change equilibrium retention directly.",
        selectivityEffect: "Does not normally change intrinsic chemical selectivity.",
        efficiencyEffect: "Smaller particles increase efficiency and can support faster flow.",
        otherEffects: "Pressure rises steeply as particle size falls; halving size can raise pressure about fourfold. Check hardware limits.",
        whyChange: "Consider a smaller particle size when efficiency is insufficient and system pressure allows it.",
        recommendationWhen: "The decision engine does not currently recommend changing particle size."
      },
      {
        name: "Temperature",
        dataKey: "setTemperature",
        valueUnit: "°C",
        function: "Controls the temperature of the column during separation.",
        category: "Column oven",
        controlPoint: "Instrument method: column-oven set temperature.",
        units: "°C",
        admissibleRange: "Use the lower temperature limit of the instrument and column; exact limits are model-specific.",
        typicalRange: "Ambient means Set Temp = 25°C (oven off); the supplied cycle also uses 40°C and 60°C, subject to hardware limits.",
        retentionEffect: "Higher temperature generally lowers reversed-phase retention and solvent viscosity.",
        selectivityEffect: "Compounds respond differently; peak spacing and even elution order can change.",
        efficiencyEffect: "Lower viscosity and faster mass transfer can modestly improve efficiency.",
        otherEffects: "Uncontrolled ambient temperature can shift retention; excess heat may degrade the column or analyte.",
        whyChange: "Change temperature after the prescribed %B cycle when peak count remains below target.",
        recommendationWhen: "After deficient runs at both calculated ambient Minimum %B and Intermediate %B, the staged flow recommends 40°C, followed by 60°C if needed."
      }
    ]
  },
  injector: {
    title: "Manual Injector / Autosampler",
    category: "Sample injection",
    function: "Introduces a measured sample plug into the pressurised mobile phase, manually or from an autosampler vial at a programmed time.",
    description: "Injection occurs after the pump; the INJECT action defines time zero. Manual injection volume is set by the installed loop, while autosampler volume is set in the method.",
    parameters: [
      {
        name: "Injection Volume",
        dataKey: "injectionVolume",
        valueUnit: " μL",
        function: "Sets sample-plug volume entering the mobile phase.",
        category: "Sample injection",
        controlPoint: "Manual: fitted sample-loop volume. Autosampler: injection-volume method setting.",
        units: "μL",
        admissibleRange: "Manual: fixed by loop size. Autosampler: instrument-specific; check its manual.",
        typicalRange: "20 μL in the supplied run conditions; use the method value.",
        retentionEffect: "Little direct effect unless the injection plug is large or its solvent is stronger than the starting mobile phase.",
        selectivityEffect: "No direct chemical selectivity effect; distortion can obscure peak separation.",
        efficiencyEffect: "Excess volume broadens bands and lowers apparent efficiency.",
        otherEffects: "Peak area rises with injected mass until column or detector saturation; carryover can create ghost peaks.",
        whyChange: "Reduce volume to limit broadening/overload; increase only when signal needs it and capacity permits.",
        recommendationWhen: "Not changed by the decision engine; keep it fixed across comparison runs."
      },
      {
        name: "Sample Concentration",
        dataKey: "sampleConc",
        valueUnit: " mg/mL",
        function: "Sets injected analyte mass together with injection volume.",
        category: "Sample injection",
        controlPoint: "Sample preparation before loading a manual injector or autosampler vial.",
        units: "mg/mL",
        admissibleRange: "Sample solubility, detector linearity, and column capacity are method-specific; confirm experimentally.",
        typicalRange: "About 1 mg/mL is cited for one supplied preparation; use the validated sample method.",
        retentionEffect: "Little direct effect until sample mass overloads the column.",
        selectivityEffect: "No direct effect at suitable loading; overload can mask resolution.",
        efficiencyEffect: "Overload can cause fronting/tailing and broader peaks.",
        otherEffects: "Peak area is comparable mainly for the same analyte across injections, not between different analytes.",
        whyChange: "Dilute if overloaded or detector-saturated; keep concentration constant across method-comparison runs.",
        recommendationWhen: "Not changed by the decision engine; maintain it during the decision cycle."
      }
    ]
  },
  detector: {
    title: "Detector (PDA/UV)",
    category: "Detection",
    function: "Measures UV absorbance as compounds elute and records the signal used to form chromatogram peaks.",
    description: "Wavelength affects which compounds are visible, not how the column separates them. A PDA can extract other wavelengths from recorded data; a single-wavelength UV detector generally requires a new run.",
    parameters: [
      {
        name: "Wavelength",
        dataKey: "wavelength",
        valueUnit: " nm",
        function: "Selects the UV wavelength used to measure analyte absorbance.",
        category: "Detection",
        controlPoint: "Instrument method: PDA/UV detector wavelength setting.",
        units: "nm",
        admissibleRange: "Limited by detector optics and analyte absorption; exact instrument limits are not stated in the supplied notes.",
        typicalRange: "254 nm in the supplied method (4 nm bandwidth).",
        retentionEffect: "No direct effect on chromatographic retention.",
        selectivityEffect: "No direct effect on chromatographic selectivity or elution order.",
        efficiencyEffect: "No effect on column efficiency; signal-to-noise affects how reliably peak width can be measured.",
        otherEffects: "A compound with weak absorbance may be missed, so measured peak count is not necessarily compound count. Methanol raises baseline at short UV wavelengths.",
        whyChange: "Change or reprocess wavelength if an expected analyte has weak detector response.",
        recommendationWhen: "Not recommended by the decision engine. Do not use wavelength to resolve co-eluting peaks."
      }
    ]
  }
};
function csvRows(text) {
  const rows = []; let row = []; let cell = ""; let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i], next = text[i + 1];
    if (c === '"' && quoted && next === '"') { cell += '"'; i += 1; }
    else if (c === '"') quoted = !quoted;
    else if (c === "," && !quoted) { row.push(cell.trim()); cell = ""; }
    else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && next === "\n") i += 1;
      row.push(cell.trim()); if (row.some(Boolean)) rows.push(row); row = []; cell = "";
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell.trim()); if (row.some(Boolean)) rows.push(row); }
  return rows;
}
function clean(value) { return String(value ?? "").toLowerCase().replace(/[()[\]{}]/g, "").replace(/\s+/g, " ").trim(); }
function numeric(value) {
  const match = String(value ?? "").replace(",", ".").match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}
function rowValue(rows, label) {
  const key = clean(label);
  const row = rows.find(r => clean(r[0]) === key || clean(r[0]).includes(key));
  return row && row[1] !== undefined ? row[1] : "";
}
function labeledValue(rows, names) {
  const aliases = names.map(clean);
  const row = rows.find(candidate => {
    const label = clean(candidate[0]);
    return aliases.some(alias => label === alias || label.startsWith(`${alias} `) || label.startsWith(alias));
  });
  return row && row[1] !== undefined ? row[1] : "";
}
function headerValue(rows, names) {
  if (rows.length < 2) return "";
  const aliases = names.map(clean);
  const index = rows[0].findIndex(value => {
    const header = clean(value);
    return aliases.some(alias => header === alias || header.startsWith(`${alias} `) || header.startsWith(alias));
  });
  return index < 0 ? "" : rows[1][index] ?? "";
}
function findText(rows, pattern) {
  for (const row of rows) for (const value of row) if (pattern.test(String(value))) return String(value);
  return "";
}
function traceValues(rows, sectionPattern) {
  const start = rows.findIndex(row => sectionPattern.test(String(row[0] || "")));
  if (start < 0) return { values: [], multiplier: 1 };
  const multiplierRow = rows.find((row, index) => index > start && index < start + 20 && clean(row[0]) === "intensity multiplier");
  const multiplier = multiplierRow ? numeric(multiplierRow[1]) : 1;
  const header = rows.findIndex((row, index) => index > start && clean(row[0]) === "r.time min");
  if (header < 0) return { values: [], multiplier };
  const values = [];
  for (let index = header + 1; index < rows.length; index += 1) {
    const row = rows[index];
    if (/^\[/.test(String(row[0] || "")) || numeric(row[0]) === null || numeric(row[1]) === null) break;
    values.push(numeric(row[1]));
  }
  return { values, multiplier };
}
function traceAverageWithin(rows, sectionPattern, endTime) {
  const start = rows.findIndex(row => sectionPattern.test(String(row[0] || "")));
  if (start < 0) return { values: [], startTime: null, endTime: null };
  const header = rows.findIndex((row, index) => index > start && clean(row[0]) === "r.time min");
  if (header < 0) return { values: [], startTime: null, endTime: null };
  const points = [];
  for (let index = header + 1; index < rows.length; index += 1) {
    const row = rows[index];
    const time = numeric(row[0]);
    const value = numeric(row[1]);
    if (/^\[/.test(String(row[0] || "")) || time === null || value === null) break;
    if (time >= 0 && (!Number.isFinite(endTime) || time <= endTime)) points.push({ time, value });
  }
  return {
    values: points.map(point => point.value),
    startTime: points.length ? points[0].time : null,
    endTime: points.length ? points[points.length - 1].time : null
  };
}
function averagedTrace(rows, sectionPattern) {
  const trace = traceValues(rows, sectionPattern);
  if (!trace.values.length) return null;
  return trace.values.reduce((total, value) => total + value, 0) / trace.values.length * trace.multiplier;
}
function roundPressure(value) {
  return Number.isFinite(value) ? Number(value.toFixed(3)) : null;
}
const NOISE_AREA_THRESHOLD = 80000;
const MINIMUM_REGRESSION_R2_THRESHOLD = 0.99;
const NAMING_MISMATCH_MESSAGE = "Inconsistencies Found in Naming: Manually Edit Column & Flow Parameters For accurate data recognition";
function filterNoise(peakRows) {
  const diagnostics = [];
  const retained = peakRows.filter(row => {
    const area = row.area;
    const kept = Number.isFinite(area) && area >= NOISE_AREA_THRESHOLD;
    diagnostics.push({ peak: row.peak, retention: row.retention, area, threshold: NOISE_AREA_THRESHOLD, kept, reason: kept ? "area meets threshold" : "area below threshold" });
    return kept;
  });
  console.groupCollapsed(`[HPLC] Peak noise filter: ${retained.length}/${peakRows.length} peaks retained`);
  console.table(diagnostics);
  console.groupEnd();
  logDebug(`[HPLC] Peak noise filter: ${retained.length}/${peakRows.length} peaks retained (area threshold: ${NOISE_AREA_THRESHOLD} AUC)`, diagnostics);
  return { rows: retained, diagnostics };
}
function parseMethodName(text, data) {
  const match = String(text).match(/GR(\d+)-(\d+)-(\d+)-([^-]+)-(\d+)-ISO-(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)(?:u)?-(?:CP|BLK)-?(\d+(?:\.\d+)?)-(.+?)([PUFR])-(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)-(amb|\d+(?:\.\d+)?)-(\d+)/i);
  if (!match) return false;
  data.groupNo = match[1]; data.injectionNo = match[2]; data.hplcNo = match[3];
  data.solvent = match[4]; data.phNo = match[5]; data.percentB = numeric(match[6]); data.flow = match[7];
  data.elutionMode = "Isocratic";
  data.injectionVolume = match[8]; data.sampleConc = match[9]; data.ligand = match[10].replace(/-+$/, "");
  data.columnType = { P: "Pinnacle", U: "Ultra", F: "Force", R: "Raptor" }[match[11].toUpperCase()] || "";
  data.length = match[12]; data.diameter = match[13]; data.particleSize = match[14];
  data.setTemperature = /^amb$/i.test(match[15]) ? "25" : match[15]; data.wavelength = match[16];
  return true;
}
function parsedNomenclature(value) {
  const parsed = {};
  return parseMethodName(value, parsed) ? parsed : null;
}
const NOMENCLATURE_FIELDS = [
  "groupNo", "injectionNo", "hplcNo", "solvent", "phNo", "percentB", "flow",
  "elutionMode", "injectionVolume", "sampleConc", "ligand", "columnType", "length",
  "diameter", "particleSize", "setTemperature", "wavelength"
];
function nomenclatureValueKey(key, value) {
  if (value === null || value === undefined || String(value).trim() === "") return "";
  if (["groupNo", "injectionNo", "hplcNo", "phNo"].includes(key)) {
    return String(value).trim().replace(/^0+(?=\d)/, "");
  }
  if (key === "solvent") {
    const solvent = String(value).trim().toUpperCase().replace(/[^A-Z]/g, "");
    return solvent === "MEOH" || solvent === "METHANOL" ? "METHANOL" : solvent;
  }
  if (key === "setTemperature" && /^amb(?:ient)?$/i.test(String(value).trim())) return "25";
  const number = numeric(value);
  if (number !== null) return String(number);
  return String(value).trim().toUpperCase();
}
function reconcileNomenclature(sources) {
  const parsedSources = sources
    .map(source => ({ name: source.name, value: parsedNomenclature(source.text) }))
    .filter(source => source.value);
  const resolved = {};
  const conflicts = {};
  NOMENCLATURE_FIELDS.forEach(key => {
    const values = parsedSources
      .map(source => ({ source: source.name, value: source.value[key], normalized: nomenclatureValueKey(key, source.value[key]) }))
      .filter(candidate => candidate.normalized !== "");
    if (!values.length) return;
    const counts = new Map();
    values.forEach(candidate => {
      const current = counts.get(candidate.normalized) || { count: 0, candidate };
      current.count += 1;
      counts.set(candidate.normalized, current);
    });
    const highestCount = Math.max(...[...counts.values()].map(entry => entry.count));
    const winner = [...counts.values()].find(entry => entry.count === highestCount);
    resolved[key] = winner.candidate.value;
    if (counts.size > 1) conflicts[key] = values.map(({ source, value }) => ({ source, value }));
  });
  return { resolved, conflicts, parsedSources };
}
function parseRun(rows, uploadedFileName = "") {
  const sampleName = rowValue(rows, "sample name") || findText(rows, /(?:GR|2GR)\d+-\d+-\d+-[^,\r\n]+-ISO-/i);
  const dataFileName = rowValue(rows, "data file name");
  const nomenclature = reconcileNomenclature([
    { name: "Sample name", text: sampleName },
    { name: "Data file name", text: dataFileName },
    { name: "Uploaded file name", text: uploadedFileName }
  ]);
  const nomenclatureMismatch = Object.keys(nomenclature.conflicts).length > 0;
  const data = { groupNo: "", injectionNo: "", hplcNo: "", phNo: "", injectionVolume: "", ligand: "", columnType: "", coreShell: "No", poreSize: "140", cLoad: "6", length: "", diameter: "", particleSize: "", solvent: "", percentB: null, flow: "", sampleConc: "", setTemperature: "", measuredTemperature: "", wavelength: "", peakCount: null, totalTime: null, resolution: null, pressure: null, sampleName, dataFileName, uploadedFileName, nomenclatureMismatch, nomenclatureConflicts: nomenclature.conflicts };
  Object.assign(data, nomenclature.resolved);
  const simple = {
    ligand: ["ligand", "stationary phase"], columnType: ["column type"], coreShell: ["coreshell", "core shell"],
    poreSize: ["pore size"], cLoad: ["c load", "carbon load"], length: ["column length", "length"],
    diameter: ["column internal diameter", "diameter"], particleSize: ["particle size"], solvent: ["solvent type", "solvent"],
    percentB: ["%b", "percent b"], flow: ["flow rate", "flow"], sampleConc: ["sample concentration", "sample conc"],
    setTemperature: ["set temperature", "set temp"], measuredTemperature: ["measured temperature"], wavelength: ["wavelength"]
  };
  Object.entries(simple).forEach(([key, names]) => {
    const value = labeledValue(rows, names) || headerValue(rows, names);
    if (value !== "") data[key] = key === "percentB" ? numeric(value) : value;
  });
  Object.assign(data, nomenclature.resolved);
  data.coreShell = /^raptor$/i.test(String(data.columnType).trim()) ? "Yes" : "No";
  data.peakCount = numeric(rowValue(rows, "# of peaks")) ?? numeric(rowValue(rows, "number of peaks"));
  data.peakCount ??= numeric(headerValue(rows, ["peak count", "number of peaks", "no. of peaks"]));
  const peakTableSection = rows.findIndex(row => /^\[Peak Table\b/i.test(String(row[0] || "")));
  const sectionEnd = peakTableSection >= 0
    ? rows.findIndex((row, index) => index > peakTableSection && /^\[/.test(String(row[0] || "")))
    : -1;
  const searchStart = peakTableSection >= 0 ? peakTableSection + 1 : 0;
  const searchEnd = sectionEnd >= 0 ? sectionEnd : rows.length;
  const peakHeader = rows.findIndex((row, index) =>
    index >= searchStart && index < searchEnd && row.some(value => clean(value) === "r.time")
  );
  const peakHeaders = peakHeader >= 0 ? rows[peakHeader].map(clean) : [];
  const columnIndex = names => peakHeaders.findIndex(header => names.includes(header));
  const peakNumberIndex = columnIndex(["peak#", "peak #"]);
  const retentionIndex = columnIndex(["r.time"]);
  const areaIndex = columnIndex(["area"]);
  const heightIndex = columnIndex(["height", "peak height"]);
  const widthIndex = columnIndex(["width", "peak width"]);
  const halfHeightWidthIndex = columnIndex(["w0.5", "w05", "width at half height", "half height width"]);
  const baselineWidthIndex = columnIndex(["wb", "baseline width", "base width"]);
  const plateIndex = columnIndex(["plate#", "plate #", "plate number", "n"]);
  const nameIndex = columnIndex(["name"]);
  const initialTimeIndex = columnIndex(["i.time", "initial time"]);
  const finalTimeIndex = columnIndex(["f.time", "final time"]);
  const resolutionIndex = columnIndex(["resolution", "r.s.", "rs"]);
  const retentionFactorIndex = columnIndex(["k'", "k", "retention factor"]);
  const peakTableRows = peakHeader >= 0 ? rows.slice(peakHeader + 1, searchEnd) : [];
  const extractedPeakRows = peakTableRows
    .filter(row => numeric(row[retentionIndex]) !== null && areaIndex >= 0)
    .map(row => ({
      peak: peakNumberIndex >= 0 ? row[peakNumberIndex] : "",
      retention: numeric(row[retentionIndex]),
      area: numeric(row[areaIndex]),
      height: heightIndex >= 0 ? numeric(row[heightIndex]) : null,
      width: widthIndex >= 0 ? numeric(row[widthIndex]) : null,
      halfHeightWidth: halfHeightWidthIndex >= 0 ? numeric(row[halfHeightWidthIndex]) : null,
      baselineWidth: baselineWidthIndex >= 0 ? numeric(row[baselineWidthIndex]) : null,
      plateNumber: plateIndex >= 0 ? numeric(row[plateIndex]) : null,
      initialTime: initialTimeIndex >= 0 ? numeric(row[initialTimeIndex]) : null,
      finalTime: finalTimeIndex >= 0 ? numeric(row[finalTimeIndex]) : null,
      name: nameIndex >= 0 ? row[nameIndex] : "",
      resolution: resolutionIndex >= 0 ? numeric(row[resolutionIndex]) : null,
      retentionFactor: retentionFactorIndex >= 0 ? numeric(row[retentionFactorIndex]) : null
    }));
  data.peaks = extractedPeakRows;
  const noiseFilter = filterNoise(extractedPeakRows);
  const peakRows = noiseFilter.rows;
  const retentions = peakRows.map(row => row.retention).filter(Number.isFinite);
  const resolutions = peakRows.map(row => row.resolution).filter(value => Number.isFinite(value) && value > 0);
  data.peakCount = peakRows.length || null;
  data.totalTime = numeric(rowValue(rows, "end time(min)")) ?? (retentions.length ? Math.max(...retentions) : null);
  data.totalTime ??= numeric(headerValue(rows, ["total retention time", "run time", "last retention time"]));
  data.resolution = resolutions.length ? Math.min(...resolutions) : null;
  data.resolution ??= numeric(headerValue(rows, ["resolution", "rs"]));
  data.pressure = roundPressure(averagedTrace(rows, /^\[LC Status Trace\(Pump A Pressure\)\]$/i));
  data.pressure ??= roundPressure(numeric(headerValue(rows, ["back pressure", "back-pressure", "pressure"])));
  const ovenTrace = traceAverageWithin(rows, /^\[LC Status Trace\(Oven Temp\.\)\]$/i, data.totalTime);
  const measuredTemperature = ovenTrace.values.length
    ? Number((ovenTrace.values.reduce((total, value) => total + value, 0) / ovenTrace.values.length).toFixed(2))
    : null;
  data.measuredTemperature = measuredTemperature ?? numeric(rowValue(rows, "measured temperature"));
  logDebug("[HPLC] Oven temperature trace", {
    startTime: ovenTrace.startTime,
    endTime: ovenTrace.endTime,
    totalRetentionTime: data.totalTime,
    sampleCount: ovenTrace.values.length,
    averageTemperature: measuredTemperature
  });
  data.wavelength = data.wavelength || numeric(rowValue(rows, "wavelength(nm)"));
  data.t0 = retentions.length ? Math.min(...retentions) : null;
  data.lastPeakRetention = retentions.length ? Math.max(...retentions) : null;
  console.groupCollapsed(`[HPLC] Extracted run ${data.groupNo || "?"}-${data.injectionNo || "?"}`);
  console.log("Method/sample:", sampleName);
  console.log("Raw peak rows:", extractedPeakRows.length);
  console.log("Filtered peak rows:", peakRows.length);
  console.log("Derived values:", { peakCount: data.peakCount, totalTime: data.totalTime, t0: data.t0, lastPeakRetention: data.lastPeakRetention, resolution: data.resolution, pressure: data.pressure, setTemperature: data.setTemperature, measuredTemperature: data.measuredTemperature, ovenTrace: { startTime: ovenTrace.startTime, endTime: ovenTrace.endTime, sampleCount: ovenTrace.values.length, average: measuredTemperature } });
  console.groupEnd();
  logDebug(`[HPLC] Extracted run ${data.groupNo || "?"}-${data.injectionNo || "?"}`, {
    sampleName,
    dataFileName,
    uploadedFileName,
    nomenclatureMismatch,
    nomenclatureConflicts: nomenclature.conflicts,
    nomenclatureSources: nomenclature.parsedSources.map(source => ({
      name: source.name,
      values: Object.fromEntries(NOMENCLATURE_FIELDS.map(key => [key, source.value[key]]))
    })),
    rawPeakRows: extractedPeakRows.length,
    filteredPeakRows: peakRows.length,
    peakCount: data.peakCount,
    totalTime: data.totalTime,
    filteredFirstPeakT0: data.t0,
    filteredLastPeakTR: data.lastPeakRetention,
    t0: data.t0,
    lastPeakRetention: data.lastPeakRetention,
    resolution: data.resolution,
    pressure: data.pressure,
    setTemperature: data.setTemperature,
    measuredTemperature: data.measuredTemperature
  });
  return data;
}
function specifications() {
  return { peaks: Number($("peakSpec").value), time: Number($("timeSpec").value), resolution: Number($("resolutionSpec").value), pressure: Number($("pressureSpec").value) };
}
function roundMinimumPercentB(value) {
  return Math.round(value);
}
function sameRunSeries(trial, reference) {
  const sameValue = key => {
    const expected = String(reference?.[key] ?? "").trim().toUpperCase();
    return !expected || String(trial[key] ?? "").trim().toUpperCase() === expected;
  };
  return sameValue("groupNo") && sameValue("hplcNo");
}
function predictionHistory(history, reference) {
  const referenceIndex = history.indexOf(reference);
  const eligibleHistory = referenceIndex >= 0 ? history.slice(0, referenceIndex + 1) : history;
  return eligibleHistory.filter(trial =>
    !trial.isSuggested &&
    sameRunSeries(trial, reference) &&
    (!reference || sameSolvent(trial.solvent, reference.solvent)) &&
    Number(trial.setTemperature) === 25 &&
    Number.isFinite(trial.percentB) &&
    trial.percentB > 0
  );
}
function minimumRetentionCycle(history = trials, reference = history.filter(trial => !trial.isSuggested).at(-1)) {
  const ambientRuns = predictionHistory(history, reference)
    .map((trial, index) => ({ trial, index, injection: numeric(trial.injectionNo) }))
    .sort((left, right) => left.injection !== null && right.injection !== null
      ? left.injection - right.injection || left.index - right.index
      : left.index - right.index)
    .map(entry => entry.trial);
  const cycles = [];
  let cycle = [];
  ambientRuns.forEach(trial => {
    const previous = cycle[cycle.length - 1];
    const step = previous ? Number(previous.percentB) - Number(trial.percentB) : null;
    if (!previous || Math.abs(step - 10) < 0.01) {
      cycle.push(trial);
    } else {
      if (cycle.length) cycles.push(cycle);
      cycle = [trial];
    }
  });
  if (cycle.length) cycles.push(cycle);
  return cycles.at(-1) || [];
}
function formatMinimumRegressionRuns(points) {
  const columns = [
    ["RUN", point => `R${String(point.index + 1).padStart(2, "0")} (Injection ${point.trial.injectionNo || "?"})`],
    ["%B", point => Number.isFinite(point.x) ? String(point.x) : "NA"],
    ["T0 (MIN)", point => Number.isFinite(point.t0) ? point.t0.toFixed(3) : "NA"],
    ["TR (MIN)", point => Number.isFinite(point.retention) ? point.retention.toFixed(3) : "NA"],
    ["K", point => Number.isFinite(point.k) ? point.k.toFixed(6) : "NA"],
    ["LOG10(K)", point => Number.isFinite(point.y) ? point.y.toFixed(6) : "NA"],
    ["PRESSURE (PSI)", point => Number.isFinite(point.pressure) ? point.pressure.toFixed(3) : "NA"],
    ["FIT STATUS", point => point.fitStatus]
  ];
  const values = points.map(point => columns.map(([, getValue]) => getValue(point)));
  const widths = columns.map(([heading], index) =>
    Math.max(heading.length, ...values.map(row => row[index].length))
  );
  const formatRow = row => row.map((value, index) => value.padEnd(widths[index])).join(" | ");
  return [formatRow(columns.map(([heading]) => heading)), widths.map(width => "-".repeat(width)).join("-+-"), ...values.map(formatRow)].join("\n");
}
function minimumPercentB(history = trials, reference = history.filter(trial => !trial.isSuggested).at(-1)) {
  const ambientRuns = minimumRetentionCycle(history, reference);
  if (!ambientRuns.length) {
    const result = MINIMUM_INTERMEDIATE_NOT_ENOUGH_RUNS;
    logDebug("[HPLC] Minimum-%B result", result);
    return result;
  }
  const pointCandidates = ambientRuns.map((trial, index) => {
    const t0 = Number.isFinite(trial.t0) && trial.t0 > 0 ? trial.t0 : null;
    const retention = Number.isFinite(trial.lastPeakRetention) ? trial.lastPeakRetention : null;
    const k = t0 !== null && retention !== null ? (retention - t0) / t0 : null;
    const usable = Number.isFinite(trial.percentB) && trial.percentB > 0 && k !== null && k > 0;
    return {
      x: trial.percentB,
      y: usable ? Math.log10(k) : null,
      t0,
      retention,
      k,
      pressure: trial.pressure,
      trial,
      index,
      usable,
      fitStatus: usable
        ? "Pending fit"
        : `Excluded: ${!Number.isFinite(trial.percentB) || trial.percentB <= 0
          ? "invalid %B"
          : t0 === null
            ? "no filtered peak for t0"
            : retention === null
              ? "no filtered peak for tR"
              : "tR must be later than t0"}`,
      reason: usable
        ? "included"
        : !Number.isFinite(trial.percentB) || trial.percentB <= 0
          ? "invalid %B"
          : t0 === null
            ? "first filtered peak t0 is missing or invalid"
            : retention === null
              ? "last-peak retention is missing"
              : "last filtered peak retention is not later than first filtered peak t0 (k <= 0)"
    };
  });
  const points = pointCandidates.filter(point => point.usable);
  logDebug("[HPLC] Ambient minimum-%B input validation", pointCandidates.map(point => ({
    groupNo: point.trial.groupNo,
    hplcNo: point.trial.hplcNo,
    injectionNo: point.trial.injectionNo,
    percentB: point.x,
    setTemperature: point.trial.setTemperature,
    t0: point.t0,
    lastPeakRetention: point.retention,
    k: point.k,
    pressure: point.pressure,
    usable: point.usable,
    reason: point.reason
  })));
  logDebug("[HPLC] Ambient minimum-%B inputs", points.map(point => ({
    groupNo: point.trial.groupNo,
    hplcNo: point.trial.hplcNo,
    injectionNo: point.trial.injectionNo,
    percentB: point.x,
    setTemperature: point.trial.setTemperature,
    t0: point.t0,
    retention: point.retention,
    k: point.k,
    log10K: point.y,
    pressure: point.pressure
  })));
  logDebug("[HPLC] Minimum-%B applicable ambient retention cycle", ambientRuns.map(trial => ({
    groupNo: trial.groupNo,
    hplcNo: trial.hplcNo,
    injectionNo: trial.injectionNo,
    percentB: trial.percentB,
    solvent: trial.solvent,
    ligand: trial.ligand,
    t0: trial.t0,
    lastPeakRetention: trial.lastPeakRetention,
    pressure: trial.pressure
  })));
  if (points.length < 3) {
    pointCandidates.filter(point => point.usable).forEach(point => {
      point.fitStatus = "Not fitted: fewer than 3 usable runs";
    });
    const result = MINIMUM_INTERMEDIATE_NOT_ENOUGH_RUNS;
    logDebug("[HPLC] Minimum-%B regression run table", formatMinimumRegressionRuns(pointCandidates));
    logDebug("[HPLC] Minimum-%B result", {
      result,
      reason: "at least three ambient runs with usable first/last noise-filtered peak retentions are required for an R²-checked regression",
      ambientCycleRuns: ambientRuns.length,
      usableRegressionPoints: points.length
    });
    return result;
  }
  const fit = values => {
    const meanX = values.reduce((sum, point) => sum + point.x, 0) / values.length;
    const meanY = values.reduce((sum, point) => sum + point.y, 0) / values.length;
    const denominator = values.reduce((sum, point) => sum + (point.x - meanX) ** 2, 0);
    if (!denominator) return null;
    const a = values.reduce((sum, point) => sum + (point.x - meanX) * (point.y - meanY), 0) / denominator;
    const b = meanY - a * meanX;
    const ssTotal = values.reduce((sum, point) => sum + (point.y - meanY) ** 2, 0);
    const ssResidual = values.reduce((sum, point) => sum + (point.y - (a * point.x + b)) ** 2, 0);
    return { a, b, r2: ssTotal === 0 ? 1 : 1 - ssResidual / ssTotal };
  };
  let usable = points;
  const removed = [];
  while (usable.length > 3) {
    const model = fit(usable);
    if (!model || model.r2 >= MINIMUM_REGRESSION_R2_THRESHOLD) break;
    let best = null;
    usable.forEach((point, index) => {
      const candidate = usable.filter((_, candidateIndex) => candidateIndex !== index);
      const candidateModel = fit(candidate);
      if (candidateModel && (!best || candidateModel.r2 > best.model.r2)) best = { point, model: candidateModel };
    });
    if (!best || best.model.r2 <= model.r2) break;
    best.point.fitStatus = "Removed to improve R²";
    removed.push({ percentB: best.point.x, log10K: best.point.y, injectionNo: best.point.trial.injectionNo });
    usable = usable.filter(point => point !== best.point);
  }
  const model = fit(usable);
  const targetRetention = specifications().time;
  const averageT0 = usable.reduce((sum, point) => sum + point.t0, 0) / usable.length;
  const targetK = (targetRetention - averageT0) / averageT0;
  const targetLog10K = targetK > 0 ? Math.log10(targetK) : null;
  const predictedPercentB = model && Number.isFinite(targetLog10K) && model.a !== 0
    ? (targetLog10K - model.b) / model.a
    : null;
  const validFit = Boolean(
    model &&
    usable.length >= 3 &&
    model.r2 >= MINIMUM_REGRESSION_R2_THRESHOLD &&
    Number.isFinite(model.a) &&
    model.a !== 0 &&
    Number.isFinite(targetLog10K) &&
    Number.isFinite(predictedPercentB)
  );
  const withinPercentBRange = validFit && predictedPercentB >= 0 && predictedPercentB <= 100;
  const result = withinPercentBRange
    ? roundMinimumPercentB(predictedPercentB)
    : validFit
      ? "NA% (Predicted %B Outside 0–100% Range)"
      : `NA% (R² < ${MINIMUM_REGRESSION_R2_THRESHOLD.toFixed(2)})`;
  usable.forEach(point => {
    point.fitStatus = validFit ? "Included in fit" : `Included; final R² below ${MINIMUM_REGRESSION_R2_THRESHOLD.toFixed(2)}`;
  });
  logDebug("[HPLC] Minimum-%B regression run table", formatMinimumRegressionRuns(pointCandidates));
  logDebug("[HPLC] Minimum-%B regression", {
    formula: "k = (targetRetention - averageT0) / averageT0; log10(k) = slope * %B + intercept; %B = (log10(k) - intercept) / slope",
    used: usable.map(point => ({ percentB: point.x, log10K: point.y })),
    removed,
    slope: model && model.a,
    intercept: model && model.b,
    r2: model && model.r2,
    r2Threshold: MINIMUM_REGRESSION_R2_THRESHOLD,
    targetRetention,
    averageT0,
    targetK,
    targetLog10K,
    predictedPercentB,
    admissiblePercentBRange: [0, 100],
    withinPercentBRange
  });
  if (!validFit) {
    logDebug("[HPLC] Minimum-%B result", result);
    return result;
  }
  logDebug("[HPLC] Minimum-%B result", { result, r2: model.r2, targetRetention, averageT0, targetK, targetLog10K });
  return result;
}
function intermediatePercentB(history = trials, reference = history.filter(trial => !trial.isSuggested).at(-1)) {
  const spec = specifications();
  const ambientCycle = minimumRetentionCycle(history, reference);
  if (ambientCycle.length <= 4) {
    logDebug("[HPLC] Intermediate-%B result", {
      result: MINIMUM_INTERMEDIATE_NOT_ENOUGH_RUNS,
      reason: "more than four sequential ambient runs at 10-point %B intervals are required",
      applicableAmbientRuns: ambientCycle.length
    });
    return MINIMUM_INTERMEDIATE_NOT_ENOUGH_RUNS;
  }
  const cycleRuns = ambientCycle.filter(trial =>
    Number.isFinite(trial.percentB) &&
    Number.isFinite(trial.peakCount) &&
    Number.isFinite(trial.lastPeakRetention) &&
    Number.isFinite(trial.resolution) &&
    Number.isFinite(trial.pressure)
  );
  logDebug("[HPLC] Intermediate-%B retention cycle", ambientCycle.map(trial => ({
    injectionNo: trial.injectionNo,
    percentB: trial.percentB,
    peakCount: trial.peakCount,
    lastPeakRetention: trial.lastPeakRetention,
    lowestResolution: trial.resolution,
    backPressure: trial.pressure,
    usable: cycleRuns.includes(trial)
  })));
  if (cycleRuns.length <= 4) {
    const result = MINIMUM_INTERMEDIATE_NOT_ENOUGH_RUNS;
    logDebug("[HPLC] Intermediate-%B result", {
      result,
      reason: cycleRuns.length === 0
        ? "ambient runs do not contain usable peak-count, last-peak retention, lowest resolution, and back-pressure data"
        : "more than four applicable ambient runs with all four required measurements are required",
      applicableAmbientRuns: ambientCycle.length,
      usableCandidateRuns: cycleRuns.length
    });
    return result;
  }
  const scales = {
    peakCount: Math.max(Math.abs(spec.peaks), 1),
    lastPeakRetention: Math.max(Math.abs(spec.time), 1),
    lowestResolution: Math.max(Math.abs(spec.resolution), 1),
    backPressure: Math.max(Math.abs(spec.pressure), 1)
  };
  const candidates = cycleRuns.map(trial => {
    const scoreComponents = {
      peakCount: Math.abs(trial.peakCount - spec.peaks) / scales.peakCount,
      lastPeakRetention: Math.abs(trial.lastPeakRetention - spec.time) / scales.lastPeakRetention,
      lowestResolution: Math.abs(trial.resolution - spec.resolution) / scales.lowestResolution,
      backPressure: Math.abs(trial.pressure - spec.pressure) / scales.backPressure
    };
    return {
      trial,
      scoreComponents,
      score: Object.values(scoreComponents).reduce((sum, value) => sum + value, 0)
    };
  }).sort((left, right) => left.score - right.score);
  const bestRuns = candidates.slice(0, 2);
  const result = Math.round(bestRuns.reduce((sum, candidate) => sum + candidate.trial.percentB, 0) / 2);
  logDebug("[HPLC] Intermediate-%B candidate scores", {
    methodSpecifications: {
      targetPeakCount: spec.peaks,
      maximumRunTime: spec.time,
      minimumResolution: spec.resolution,
      maximumBackPressure: spec.pressure
    },
    scoreMethod: "sum of absolute normalized differences from each method specification; lower total is a closer match",
    candidates: candidates.map(candidate => ({
      injectionNo: candidate.trial.injectionNo,
      percentB: candidate.trial.percentB,
      peakCount: candidate.trial.peakCount,
      lastPeakRetention: candidate.trial.lastPeakRetention,
      lowestResolution: candidate.trial.resolution,
      backPressure: candidate.trial.pressure,
      scoreComponents: candidate.scoreComponents,
      totalScore: candidate.score,
      selected: bestRuns.includes(candidate)
    }))
  });
  logDebug("[HPLC] Intermediate-%B result", {
    result,
    selectedRuns: bestRuns.map(candidate => ({
      injectionNo: candidate.trial.injectionNo,
      percentB: candidate.trial.percentB,
      peakCount: candidate.trial.peakCount,
      lastPeakRetention: candidate.trial.lastPeakRetention,
      lowestResolution: candidate.trial.resolution,
      backPressure: candidate.trial.pressure,
      scoreComponents: candidate.scoreComponents,
      score: candidate.score
    }))
  });
  return result;
}
function decisionRunTime(data) {
  return Number.isFinite(data.lastPeakRetention) ? data.lastPeakRetention : data.totalTime;
}
function predictedRuntimeAtLowerPercentB(data, targetPercentB) {
  const setTemperature = Number(data.setTemperature);
  const runtime = decisionRunTime(data);
  const trialIndex = trials.indexOf(data);
  if (trialIndex < 0 || !Number.isFinite(setTemperature) || !Number.isFinite(runtime) || !Number.isFinite(data.percentB)) return null;
  const sameTemperatureRuns = trials.slice(0, trialIndex + 1).filter(trial =>
    !trial.isSuggested &&
    Number(trial.setTemperature) === setTemperature &&
    String(trial.groupNo || "").trim().toUpperCase() === String(data.groupNo || "").trim().toUpperCase() &&
    String(trial.hplcNo || "").trim().toUpperCase() === String(data.hplcNo || "").trim().toUpperCase() &&
    sameSolvent(trial.solvent, data.solvent) &&
    Number.isFinite(trial.percentB) &&
    Number.isFinite(decisionRunTime(trial))
  );
  const cycles = [];
  let cycle = [];
  sameTemperatureRuns.forEach(trial => {
    const previous = cycle[cycle.length - 1];
    if (!previous || trial.percentB < previous.percentB) {
      cycle.push(trial);
    } else {
      if (cycle.length) cycles.push(cycle);
      cycle = [trial];
    }
  });
  if (cycle.length) cycles.push(cycle);
  const matchingCycle = cycles.find(candidate => candidate.includes(data));
  if (!matchingCycle || matchingCycle.length < 2) return null;
  const currentRunIndex = matchingCycle.indexOf(data);
  const latestRuns = matchingCycle.slice(Math.max(0, currentRunIndex - 1), currentRunIndex + 1);
  if (latestRuns.length < 2) return null;
  const [previous, latest] = latestRuns;
  const percentDifference = latest.percentB - previous.percentB;
  if (percentDifference === 0) return null;
  const runtimePerPercent = (decisionRunTime(latest) - decisionRunTime(previous)) / percentDifference;
  const predicted = runtime + runtimePerPercent * (targetPercentB - data.percentB);
  return Number.isFinite(predicted) ? predicted : null;
}
const STRATEGY_RECOMMENDATIONS = [
  "",
  "Change Temperature to 40 degrees/ Run previous %B",
  "Change Temperature to 60 degrees/ Run previous %B",
  "Change Solvent/ Run previous %B At Ambient Temperature",
  "Change Solvent/Change Temperature to 40 degrees/ Run previous %B",
  "Change Solvent/Change Temperature to 60 degrees/ Run previous %B",
  "Change Solvent to Mix At Ambient Temperature/ Run previous %B",
  "Mixed Solvent/Change Temperature to 40 degrees/ Run previous %B",
  "Mixed Solvent/Change Temperature to 60 degrees/ Run previous %B",
  "Change Ligand/ Run previous %B"
];
function strategyPercentOptions(history = trials, reference = history.filter(trial => !trial.isSuggested).at(-1)) {
  const intermediate = intermediatePercentB(history, reference);
  if (!Number.isFinite(intermediate)) return [];
  const endpoint = Math.max(0, Math.min(100, intermediate));
  const values = [];
  for (let value = 100; value >= endpoint; value -= 10) values.push(value);
  values.push(endpoint);
  return [...new Set(values.map(value => Number(value.toFixed(2))))].sort((left, right) => right - left);
}
function sameSolvent(left, right) {
  return String(left || "").trim().toUpperCase().replace(/[^A-Z]/g, "") ===
    String(right || "").trim().toUpperCase().replace(/[^A-Z]/g, "");
}
function strategyStages(base, history = trials) {
  const originalSolvent = String(base.solvent || "ACN").trim();
  const changedSolvent = history.filter(trial =>
    Number(trial.setTemperature) === 25 &&
    String(trial.ligand || "").trim().toUpperCase() === String(base.ligand || "").trim().toUpperCase() &&
    /^(ACN|METHANOL|MEOH)$/i.test(String(trial.solvent || "").trim()) &&
    !sameSolvent(trial.solvent, originalSolvent)
  ).at(-1)?.solvent;
  const alternateSolvent = changedSolvent ||
    (/^ACN$/i.test(originalSolvent) ? "METHANOL" : "ACN");
  const mixedSolvent = history
    .filter(trial => Number(trial.setTemperature) === 25 &&
      String(trial.ligand || "").trim().toUpperCase() === String(base.ligand || "").trim().toUpperCase() &&
      isMixedSolvent(trial.solvent, originalSolvent, alternateSolvent))
    .at(-1)?.solvent || "MIX";
  return [
    { solvent: originalSolvent, temperature: 25, ligand: base.ligand, recommendation: "" },
    { solvent: originalSolvent, temperature: 40, ligand: base.ligand, recommendation: STRATEGY_RECOMMENDATIONS[1] },
    { solvent: originalSolvent, temperature: 60, ligand: base.ligand, recommendation: STRATEGY_RECOMMENDATIONS[2] },
    { solvent: alternateSolvent, temperature: 25, ligand: base.ligand, recommendation: STRATEGY_RECOMMENDATIONS[3] },
    { solvent: alternateSolvent, temperature: 40, ligand: base.ligand, recommendation: STRATEGY_RECOMMENDATIONS[4] },
    { solvent: alternateSolvent, temperature: 60, ligand: base.ligand, recommendation: STRATEGY_RECOMMENDATIONS[5] },
    { solvent: mixedSolvent, temperature: 25, ligand: base.ligand, recommendation: STRATEGY_RECOMMENDATIONS[6] },
    { solvent: mixedSolvent, temperature: 40, ligand: base.ligand, recommendation: STRATEGY_RECOMMENDATIONS[7] },
    { solvent: mixedSolvent, temperature: 60, ligand: base.ligand, recommendation: STRATEGY_RECOMMENDATIONS[8] }
  ];
}
function isMixedSolvent(solvent, originalSolvent, alternateSolvent) {
  const normalized = String(solvent || "").trim();
  return /MIX/i.test(normalized) ||
    (/ACN/i.test(normalized) && /METHANOL|MEOH/i.test(normalized)) ||
    (Boolean(normalized) && !sameSolvent(normalized, originalSolvent) && !sameSolvent(normalized, alternateSolvent));
}
function matchesStage(trial, stage) {
  const solventMatches = sameSolvent(trial.solvent, stage.solvent);
  const ligandMatches = stage.ligand === ""
    ? /^[ABCD]$/i.test(String(trial.ligand || "").trim())
    : String(trial.ligand || "").trim().toUpperCase() === String(stage.ligand || "").trim().toUpperCase();
  return solventMatches &&
    Number(trial.setTemperature) === stage.temperature &&
    ligandMatches;
}
function lastResortRuns(base, history, reference = history.filter(trial => !trial.isSuggested).at(-1)) {
  const minimum = minimumPercentB(history, reference);
  const intermediate = intermediatePercentB(history, reference);
  if (!Number.isFinite(minimum) || !Number.isFinite(intermediate)) {
    return { minimum, intermediate, minimumRun: null, intermediateRun: null };
  }
  const ambientRuns = predictionHistory(history, reference).filter(trial =>
    Number(trial.setTemperature) === 25 &&
    sameSolvent(trial.solvent, base.solvent) &&
    Number.isFinite(trial.percentB) &&
    Number.isFinite(trial.peakCount) &&
    trial.peakCount < specifications().peaks
  );
  const minimumIndex = ambientRuns.findIndex(trial => Math.abs(trial.percentB - minimum) < 0.01);
  const minimumRun = minimumIndex < 0 ? null : ambientRuns[minimumIndex];
  const intermediateIndex = minimumIndex < 0 ? -1 : ambientRuns.findIndex((trial, index) =>
    index > minimumIndex && Math.abs(trial.percentB - intermediate) < 0.01
  );
  const intermediateRun = intermediateIndex < 0 ? null : ambientRuns[intermediateIndex];
  return { minimum, intermediate, minimumRun, intermediateRun };
}
function hasCompletedAmbientLastResort(base, history) {
  const { minimumRun, intermediateRun } = lastResortRuns(base, history);
  return Boolean(minimumRun && intermediateRun);
}
function strategyRecommendation(data, history = trials.slice(0, trials.indexOf(data) + 1).filter(trial => !trial.isSuggested)) {
  if (data.peakCount >= specifications().peaks) return null;
  const seriesHistory = history.filter(trial => sameRunSeries(trial, data));
  const base = seriesHistory.find(trial => sameSolvent(trial.solvent, data.solvent));
  if (!base) return null;
  const lastResort = lastResortRuns(base, seriesHistory, data);
  if (!lastResort.minimumRun) return null;
  if (!lastResort.intermediateRun) return "Jump to Minimum %B OR Intermediate %B";
  const stages = strategyStages(base, seriesHistory);
  const qualifyingHistory = seriesHistory.filter(trial =>
    Number.isFinite(trial.peakCount) && trial.peakCount < specifications().peaks
  );
  for (let stageIndex = 1; stageIndex < stages.length; stageIndex += 1) {
    const previousStage = stages[stageIndex - 1];
    const previousPercentBs = [];
    qualifyingHistory
      .filter(trial => matchesStage(trial, previousStage) && Number.isFinite(trial.percentB))
      .forEach(trial => {
        const percentB = Number(trial.percentB);
        if (!previousPercentBs.some(value => Math.abs(value - percentB) < 0.01)) previousPercentBs.push(percentB);
      });
    if (!previousPercentBs.length) return null;
    const currentStage = stages[stageIndex];
    let nextPercentIndex = 0;
    qualifyingHistory
      .filter(trial => matchesStage(trial, currentStage) && Number.isFinite(trial.percentB))
      .forEach(trial => {
        if (Math.abs(Number(trial.percentB) - previousPercentBs[nextPercentIndex]) < 0.01) {
          nextPercentIndex += 1;
        }
      });
    const isComplete = nextPercentIndex >= previousPercentBs.length;
    if (!isComplete) return currentStage.recommendation;
  }

  const ligandStage = {
    solvent: stages[stages.length - 1].solvent,
    temperature: 60,
    ligand: "",
    recommendation: STRATEGY_RECOMMENDATIONS[9]
  };
  return ligandStage.recommendation;
}
function decision(data, history = trials.slice(0, trials.indexOf(data) + 1).filter(trial => !trial.isSuggested)) {
  const spec = specifications();
  const runTime = decisionRunTime(data);
  if (data.peakCount === null || !Number.isFinite(runTime)) return "Missing peak count or last peak retention time";
  if (data.peakCount < spec.peaks) {
    const seriesHistory = history.filter(trial => sameRunSeries(trial, data));
    const strategyBase = seriesHistory.find(trial => sameSolvent(trial.solvent, data.solvent));
    if (strategyBase && hasCompletedAmbientLastResort(strategyBase, seriesHistory)) {
      const strategy = strategyRecommendation(data, seriesHistory);
      if (strategy) return strategy;
    }
    if (data.percentB > 0 && runTime < spec.time) {
      const nextPercent = Math.max(0, data.percentB - 10);
      const predictedRuntime = predictedRuntimeAtLowerPercentB(data, nextPercent);
      logDebug("[HPLC] Next-decrease retention estimate", {
        currentPercentB: data.percentB,
        nextPercentB: nextPercent,
        currentLastPeakRetention: runTime,
        predictedLastPeakRetention: predictedRuntime,
        maximumRunTime: spec.time
      });
      if (!Number.isFinite(predictedRuntime) || predictedRuntime <= spec.time) {
        return "Decrease %B by 10";
      }
    }
    const strategy = strategyRecommendation(data, seriesHistory);
    if (strategy) return strategy;
    if (!Number.isFinite(data.percentB) || data.percentB <= 0 || runTime >= spec.time) {
      return runTime < spec.time ? "Jump to Minimum %B OR Intermediate %B" : "Jump to Minimum %B THEN, Intermediate %B";
    }
    return "Jump to Minimum %B OR Intermediate %B";
  }
  if (runTime < spec.time && data.resolution !== null && data.resolution < spec.resolution) return "N";
  if (runTime < spec.time && data.resolution !== null && data.resolution >= spec.resolution) return "😊 increase F until R = spec to get most efficient method";
  if (runTime > spec.time && data.resolution !== null && data.resolution < spec.resolution) return "Jump to SEL cycle";
  if (runTime > spec.time && data.resolution !== null && data.resolution >= spec.resolution) return "N";
  return "Targets met";
}
function nextPercentB(data, recommendation, history = trials) {
  if (STRATEGY_RECOMMENDATIONS.includes(recommendation)) {
    return Number.isFinite(data.percentB) ? data.percentB : 100;
  }
  if (recommendation === "Decrease %B by 10") {
    return Number.isFinite(data.percentB) ? Math.max(0, data.percentB - 10) : null;
  }
  if (/minimum %b/i.test(recommendation)) return minimumPercentB(history, data);
  if (recommendation === "Jump to SEL cycle") return Number.isFinite(data.percentB) ? data.percentB : null;
  return null;
}
function suggestedPercentBs(trial) {
  if (trial.recommendation === "Jump to Minimum %B OR Intermediate %B") {
    const values = [...new Set([trial.minimumPercentBResult, trial.intermediatePercentBResult].filter(Number.isFinite))];
    if (!values.length) return [trial.minimumPercentBResult || MINIMUM_INTERMEDIATE_NOT_ENOUGH_RUNS];
    return [Number.isFinite(trial.minimumIntermediateSelection) && values.includes(trial.minimumIntermediateSelection)
      ? trial.minimumIntermediateSelection
      : values[0]];
  }
  if (trial.recommendation === "Jump to Minimum %B THEN, Intermediate %B") {
    const values = [trial.minimumPercentBResult, trial.intermediatePercentBResult].filter(Number.isFinite);
    return values.length ? values : [MINIMUM_INTERMEDIATE_NOT_ENOUGH_RUNS];
  }
  if (trial.nextPercentB === null || trial.nextPercentB === undefined) return [];
  if (!Number.isFinite(trial.nextPercentB)) return [trial.nextPercentB];
  return [trial.nextPercentB];
}
function predictionPlan(data, recommendation, history = trials.slice(0, trials.indexOf(data) + 1).filter(trial => !trial.isSuggested)) {
  if (STRATEGY_RECOMMENDATIONS.includes(recommendation) && recommendation) {
    const stageIndex = STRATEGY_RECOMMENDATIONS.indexOf(recommendation);
    const seriesHistory = history.filter(trial => sameRunSeries(trial, data));
    const base = seriesHistory[0] || data;
    const stages = strategyStages(base, seriesHistory);
    const stage = stages[stageIndex] || {
      solvent: stages[stages.length - 1].solvent, temperature: 60, ligand: "",
      recommendation: STRATEGY_RECOMMENDATIONS[9]
    };
    const usedLigands = new Set(seriesHistory
      .filter(trial => matchesStage(trial, stage))
      .map(trial => String(trial.ligand || "").trim().toUpperCase()));
    const ligand = ["A", "B", "C", "D"].find(option => !usedLigands.has(option)) || "A";
    const solventControl = stageIndex === 3 ? "organic-solvent"
      : stageIndex === 6 ? "mixed-solvent" : "";
    const solvent = stage.solvent;
    const percentOptions = strategyPercentOptions(seriesHistory, data);
    const requestedPercent = Number.isFinite(data.percentB) ? data.percentB : 100;
    if (!percentOptions.includes(requestedPercent)) percentOptions.push(requestedPercent);
    return {
      percentB: percentOptions.includes(requestedPercent) ? requestedPercent : percentOptions[0],
      percentOptions,
      solvent,
      solventControl,
      temperature: stage.temperature,
      ligand: stageIndex === 9 ? ligand : stage.ligand,
      ligandControl: stageIndex === 9
    };
  }
  return null;
}
function updateRecommendation(trial) {
  const trialIndex = trials.indexOf(trial);
  const history = (trialIndex < 0 ? trials : trials.slice(0, trialIndex + 1))
    .filter(item => !item.isSuggested);
  trial.recommendation = decision(trial, history);
  const needsMinimumPrediction = /minimum %b/i.test(trial.recommendation);
  trial.minimumPercentBResult = needsMinimumPrediction ? minimumPercentB(history, trial) : null;
  trial.intermediatePercentBResult = needsMinimumPrediction ? intermediatePercentB(history, trial) : null;
  trial.nextPercentB = nextPercentB(trial, trial.recommendation, history);
  trial.prediction = predictionPlan(trial, trial.recommendation, history);
}
function selectivityPercentOptions() {
  const options = trials
    .filter(trial => !trial.isSuggested && Number(trial.setTemperature) === 25 && Number.isFinite(trial.percentB))
    .map(trial => trial.percentB);
  trials.forEach(trial => {
    if (Number.isFinite(trial.nextPercentB) && /minimum %b/i.test(trial.recommendation)) options.push(trial.nextPercentB);
  });
  return [...new Set(options)].sort((left, right) => right - left);
}
function shown(value, unit = "") {
  if (value === null || value === "") return "Not found";
  if (value === "-") return "-";
  if (unit === "%" && typeof value === "string" && value.includes("%")) return value;
  return `${value}${unit}`;
}
function parameterShown(value, unit = "") {
  if (value === null || value === undefined || value === "") return "-";
  return shown(value, unit);
}
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;"
  })[character]);
}
function equipmentValue(parameter, trial) {
  if (!parameter.dataKey || !trial) return "No value recorded for the selected run.";
  const value = trial[parameter.dataKey];
  return value === null || value === undefined || value === ""
    ? "Not present in the selected run."
    : `${parameterShown(value, parameter.valueUnit || "")}`;
}
function equipmentField(label, value, valueClass = "") {
  if (!value) return "";
  const content = valueClass
    ? `<div class="${escapeHtml(valueClass)}">${escapeHtml(value)}</div>`
    : escapeHtml(value);
  return `<tr><th scope="row">${escapeHtml(label)}</th><td>${content}</td></tr>`;
}
function renderEquipmentParameter(module, parameter, trial) {
  const failureWarning = module.title === "Degasser" && parameter.otherEffects.includes("Failure signs")
    ? "equipment-failure-warning"
    : "";
  const fields = [
    equipmentField("Parameter function", parameter.function),
    equipmentField("Category", parameter.category || module.category),
    equipmentField("Instrument control point", parameter.controlPoint),
    equipmentField("Units", parameter.units),
    equipmentField("Admissible / allowed range", parameter.admissibleRange),
    equipmentField("Typical operating range", parameter.typicalRange),
    equipmentField("Effect on retention", parameter.retentionEffect),
    equipmentField("Effect on selectivity", parameter.selectivityEffect),
    equipmentField("Effect on efficiency", parameter.efficiencyEffect),
    equipmentField("Other chromatographic / system effects", parameter.otherEffects, failureWarning),
    equipmentField("Why this parameter may be changed", parameter.whyChange),
    equipmentField("When this tool recommends changing it", parameter.recommendationWhen)
  ].filter(Boolean).join("");
  return `<section class="equipment-parameter-card" aria-live="polite">
    <h4>${escapeHtml(parameter.name)}</h4>
    <div class="table-wrap"><table class="equipment-info-table"><tbody>${fields}</tbody></table></div>
  </section>`;
}
function renderEquipment() {
  document.querySelectorAll("[data-equipment-module]").forEach(button => {
    const selected = button.dataset.equipmentModule === activeEquipmentModule;
    button.classList.toggle("active", selected);
    if (button.classList.contains("equipment-tab")) button.setAttribute("aria-selected", String(selected));
    if (button.classList.contains("equipment-hotspot")) button.setAttribute("aria-pressed", String(selected));
  });
  $("equipmentLayout").hidden = false;
  if (!activeEquipmentModule) {
    $("equipmentDetails").innerHTML = '<p class="empty-selection">Choose a module on the schematic or from the tabs. Then choose a parameter to see what it does, where it is controlled, and how it affects the chromatogram.</p>';
    return;
  }
  const module = equipmentModules[activeEquipmentModule];
  if (!module) return;
  const parameters = module.parameters || [];
  if (!parameters.some(parameter => parameter.name === activeEquipmentParameter)) {
    activeEquipmentParameter = parameters.length ? parameters[0].name : "";
  }
  const parameter = parameters.find(item => item.name === activeEquipmentParameter) || parameters[0];
  const trialIndex = currentViewedTrialIndex ?? parameterTrialIndex;
  const trial = trialIndex === null ? null : trials[trialIndex];
  const pumpArrangements = activeEquipmentModule === "pump"
    ? `<section class="pump-arrangements" aria-label="Two ways of arranging solvent mixing">
        <h4>Two Ways of Arranging This</h4>
        <article class="pump-arrangement">
          <div>
            <h5>Binary System</h5>
            <p>Two pumps deliver the solvents separately. They mix after the pumps, at high pressure.</p>
          </div>
          <div class="pump-arrangement-images">
            <figure>
              <img src="binary-system-schematic.png" alt="Binary HPLC system schematic: two pumps feed a mixer after the pumps, then the injector and column">
              <figcaption>Clip-art diagram</figcaption>
            </figure>
            <figure>
              <img src="binary-system-instrument.png" alt="Real HPLC instrument showing the binary pump components">
              <figcaption>Instrument photo</figcaption>
            </figure>
          </div>
        </article>
        <article class="pump-arrangement">
          <div>
            <h5>Quaternary System</h5>
            <p>A proportioning valve mixes up to four solvents before the pump, at low pressure.</p>
          </div>
          <div class="pump-arrangement-images">
            <figure>
              <img src="quaternary-system-schematic.png" alt="Quaternary HPLC system schematic: solvent lines meet at a proportioning valve before the pump">
              <figcaption>Clip-art diagram</figcaption>
            </figure>
            <figure>
              <img src="quaternary-system-instrument.png" alt="Real HPLC instrument showing the quaternary solvent proportioning valve and pump">
              <figcaption>Instrument photo</figcaption>
            </figure>
          </div>
        </article>
      </section>`
    : "";
  const injectorImage = activeEquipmentModule === "injector"
    ? `<section class="injector-image-gallery" aria-label="Manual injector and autosampler images">
        <h4>Manual Injector / Autosampler</h4>
        <div class="injector-image-tabs" role="group" aria-label="Choose injector image">
          <button type="button" class="injector-image-tab${activeInjectorImage === "manual" ? " active" : ""}" data-injector-image="manual" aria-pressed="${activeInjectorImage === "manual"}">Manual Injector</button>
          <button type="button" class="injector-image-tab${activeInjectorImage === "autosampler" ? " active" : ""}" data-injector-image="autosampler" aria-pressed="${activeInjectorImage === "autosampler"}">Autosampler</button>
        </div>
        <figure class="injector-image-figure">
          <img src="${activeInjectorImage === "manual" ? "Manual%20injector.png" : "autosampler.png"}" alt="${activeInjectorImage === "manual" ? "Manual HPLC injector being operated with a syringe" : "HPLC autosampler sample-vial tray"}">
          <figcaption>${activeInjectorImage === "manual" ? "Manual Injector" : "Autosampler"}</figcaption>
        </figure>
      </section>`
    : "";
  $("equipmentDetails").innerHTML = `<h3>${escapeHtml(module.title)}</h3>
    <p><strong>Function:</strong> ${escapeHtml(module.function)}</p>
    <p><strong>Category:</strong> ${escapeHtml(module.category)}</p>
    <p><strong>Associated parameters:</strong> ${parameters.map(item => escapeHtml(item.name)).join(", ")}</p>
    <p>${escapeHtml(module.description)}</p>
    <label class="equipment-parameter-select" for="equipmentParameter">Select parameter
      <select id="equipmentParameter" aria-label="Select parameter">
        ${parameters.map(item => `<option value="${escapeHtml(item.name)}"${item.name === (parameter && parameter.name) ? " selected" : ""}>${escapeHtml(item.name)}</option>`).join("")}
      </select>
    </label>
    ${parameter ? renderEquipmentParameter(module, parameter, trial) : ""}
    ${pumpArrangements}`;
  const injectorGallery = $("equipmentLayout").querySelector(".injector-image-gallery");
  if (injectorGallery) injectorGallery.remove();
  if (injectorImage) $("equipmentFigure").insertAdjacentHTML("beforeend", injectorImage);
}
function renderParameters(data) {
  const canEditAllRuns = trials.some(trial => trial.nomenclatureMismatch);
  $("nomenclatureWarning").hidden = !canEditAllRuns;
  const cell = ([label, key]) => {
    if (key === "coreShell") {
      return parameterShown(/^raptor$/i.test(String(data.columnType).trim()) ? "Yes" : "No");
    }
    if (canEditAllRuns) {
      return `<input type="text" aria-label="${escapeHtml(label)}" data-parameter-key="${escapeHtml(key)}" value="${escapeHtml(data[key] ?? "")}">`;
    }
    if (key === "columnType") {
      return parameterShown(data[key]);
    }
    if (key === "poreSize" || key === "cLoad") {
      return `<input type="text" aria-label="${escapeHtml(label)}" data-parameter-key="${escapeHtml(key)}" value="${escapeHtml(data[key] ?? "")}">`;
    }
    return parameterShown(data[key], key === "percentB" ? "%" : "");
  };
  $("parameters").innerHTML = `<div class="table-wrap"><table><thead><tr>${parameterLabels.map(([label]) => `<th>${label}</th>`).join("")}</tr></thead><tbody><tr>${parameterLabels.map(cell).map(value => `<td>${value}</td>`).join("")}</tr></tbody></table></div>`;
}
function renderTrials() {
  const rows = [];
  trials.forEach((trial, index) => {
    rows.push(trialRow(trial, index + 1, trial.recommendation, false, index));
    suggestedPercentBs(trial).forEach((percentB, suggestionIndex) => {
      const suggestionKey = `${index}:${suggestionIndex}`;
      if (deletedSuggestions.has(suggestionKey)) return;
      const hasMinimumIntermediatePredictions =
        trial.recommendation === "Jump to Minimum %B OR Intermediate %B" ||
        trial.recommendation === "Jump to Minimum %B THEN, Intermediate %B";
      const isMinimumIntermediateChoice =
        trial.recommendation === "Jump to Minimum %B OR Intermediate %B";
      const minimumIntermediateOptions = isMinimumIntermediateChoice
        ? [...new Set([trial.minimumPercentBResult, trial.intermediatePercentBResult].filter(Number.isFinite))]
        : [];
      const nextTrial = {
        ...trial,
        percentB: trial.prediction?.percentOptions ? trial.prediction.percentB : percentB,
        recommendation: "Suggested next run", isSuggested: true
      };
      const nextNumber = Number(trial.injectionNo);
      nextTrial.injectionNo = Number.isFinite(nextNumber) ? String(nextNumber + suggestionIndex + 1).padStart(String(trial.injectionNo).length, "0") : `${index + suggestionIndex + 2}`;
      nextTrial.suggestionKey = suggestionKey;
      nextTrial.suggestionIndex = suggestionIndex;
      nextTrial.prediction = hasMinimumIntermediatePredictions ? null : trial.prediction;
      nextTrial.minimumIntermediateOptions = minimumIntermediateOptions;
      nextTrial.suggestionType = hasMinimumIntermediatePredictions
        ? isMinimumIntermediateChoice
          ? "minimum-intermediate-choice"
          : Number.isFinite(percentB)
            ? suggestionIndex === 0 ? "minimum" : "intermediate"
            : "minimum-intermediate-unavailable"
        : "next";
      nextTrial.minimumPercentBResult = trial.minimumPercentBResult;
      nextTrial.intermediatePercentBResult = trial.intermediatePercentBResult;
      nextTrial.isSelectivity = trial.recommendation === "Jump to SEL cycle";
      nextTrial.measuredTemperature = "";
      rows.push(nextTrial);
    });
  });
  const renderedRows = rows.map((row, rowIndex) => {
    if (typeof row === "string") return row;
    const hasRowBelow = rowIndex < rows.length - 1;
    const recommendation = row.suggestionType === "minimum-intermediate-choice"
      ? "Suggested minimum/intermediate %B"
      : row.suggestionType === "minimum"
        ? "Suggested minimum %B"
      : row.suggestionType === "intermediate"
        ? "Suggested intermediate %B"
        : row.suggestionType === "minimum-intermediate-unavailable"
          ? "Minimum/intermediate %B unavailable"
        : "Suggested next run";
    return trialRow(row, row.injectionNo, recommendation, true);
  });
  $("trialTable").querySelector("tbody").innerHTML = renderedRows.join("");
}
function trialRow(trial, fallbackNumber, recommendation, canDelete = false, sourceIndex = null) {
  const cells = parameterLabels.map(([, key]) => {
    if (trial.isSuggested && trial.prediction && key === "percentB" && trial.prediction.percentOptions?.length) {
      return `<td><select class="prediction-percent" data-suggestion-key="${trial.suggestionKey}" aria-label="Predicted %B">${trial.prediction.percentOptions.map(value => `<option value="${value}"${Number(trial.prediction.percentB) === value ? " selected" : ""}>${value}% B</option>`).join("")}</select></td>`;
    }
    if (trial.isSuggested && key === "percentB" && trial.suggestionType === "minimum") {
      return `<td>${parameterShown(trial[key], "%")}<small>Minimum %B</small></td>`;
    }
    if (trial.isSuggested && key === "percentB" && trial.suggestionType === "intermediate") {
      return `<td>${parameterShown(trial[key], "%")}<small>Intermediate %B</small></td>`;
    }
    if (trial.isSuggested && key === "percentB" && trial.suggestionType === "minimum-intermediate-choice") {
      const options = trial.minimumIntermediateOptions.map(value =>
        `<option value="${value}"${Number(trial.percentB) === value ? " selected" : ""}>${value}%</option>`
      );
      if (!Number.isFinite(trial.minimumPercentBResult)) {
        if (!options.length) {
          options.push(`<option value="" selected disabled>${escapeHtml(String(trial.minimumPercentBResult || MINIMUM_INTERMEDIATE_NOT_ENOUGH_RUNS))}</option>`);
        } else {
          options.unshift(`<option value="" disabled>${escapeHtml(String(trial.minimumPercentBResult || "Minimum %B unavailable"))}</option>`);
        }
      }
      if (!Number.isFinite(trial.intermediatePercentBResult) && trial.minimumIntermediateOptions.length) {
        options.push(`<option value="" disabled>Intermediate %B unavailable</option>`);
      }
      return `<td><select class="minimum-intermediate-percent" data-suggestion-key="${trial.suggestionKey}" aria-label="Choose predicted minimum or intermediate %B" title="${trial.minimumIntermediateOptions.length ? "Click to choose a calculated minimum or intermediate %B" : "No minimum/intermediate value is available until enough usable ambient runs are uploaded"}"${trial.minimumIntermediateOptions.length ? "" : " disabled"}>${options.join("")}</select></td>`;
    }
    if (trial.isSuggested && trial.prediction && key === "solvent" && trial.prediction.solventControl === "organic-solvent") {
      return `<td><select class="prediction-solvent" data-suggestion-key="${trial.suggestionKey}" aria-label="Predicted solvent"><option value="ACN"${trial.prediction.solvent === "ACN" ? " selected" : ""}>ACN</option><option value="METHANOL"${trial.prediction.solvent === "METHANOL" ? " selected" : ""}>METHANOL</option></select></td>`;
    }
    if (trial.isSuggested && trial.prediction && key === "solvent" && trial.prediction.solventControl === "mixed-solvent") {
      return `<td><input class="prediction-solvent-text" data-suggestion-key="${trial.suggestionKey}" aria-label="Predicted mixed solvent" value="${escapeHtml(trial.prediction.solvent)}"></td>`;
    }
    if (trial.isSuggested && trial.prediction?.ligandControl && key === "ligand") {
      return `<td><select class="prediction-ligand" data-suggestion-key="${trial.suggestionKey}" aria-label="Predicted ligand">${["A", "B", "C", "D"].map(value => `<option value="${value}"${trial.prediction.ligand === value ? " selected" : ""}>${value}</option>`).join("")}</select></td>`;
    }
    if (trial.isSuggested && trial.prediction && key === "setTemperature") {
      const temperature = trial.prediction.temperature === 25 ? "Ambient" : String(trial.prediction.temperature);
      return `<td>${escapeHtml(temperature)}</td>`;
    }
    if (trial.isSuggested && trial.isSelectivity && key === "percentB") {
      const options = selectivityPercentOptions();
      const intermediateSelected = trial.percentB === "";
      return `<td><select class="suggestion-percent" data-suggestion-key="${trial.suggestionKey}"><option value="intermediate"${intermediateSelected ? " selected" : ""}>Intermediate %B (blank)</option>${options.map(value => `<option value="${value}"${Number(trial.percentB) === value ? " selected" : ""}>${value}%</option>`).join("")}</select></td>`;
    }
    if (trial.isSuggested && trial.isSelectivity && key === "setTemperature") {
      const temperature = trial.suggestedTemperature || "40";
      return `<td><select class="suggestion-temperature" data-suggestion-key="${trial.suggestionKey}"><option value="40"${temperature === "40" ? " selected" : ""}>40°C</option><option value="60"${temperature === "60" ? " selected" : ""}>60°C</option></select></td>`;
    }
    return `<td>${parameterShown(trial[key], key === "percentB" ? "%" : "")}</td>`;
  }).join("");
  const action = canDelete
    ? `<button type="button" class="delete-suggestion" data-suggestion-key="${trial.suggestionKey}">Delete</button>`
    : trial.nomenclatureMismatch
      ? `<span class="nomenclature-warning">${escapeHtml(NAMING_MISMATCH_MESSAGE).replace(/\n/g, "<br>")}</span>`
      : "";
  const selected = !trial.isSuggested && sourceIndex === currentViewedTrialIndex ? " selected-trial" : "";
  const classes = `${trial.isSuggested ? "suggested-trial" : "source-trial"}${selected}`;
  const sourceAttribute = sourceIndex === null ? "" : ` data-source-index="${sourceIndex}"`;
  return `<tr class="${classes}"${sourceAttribute}><td>${parameterShown(trial.groupNo)}</td><td>${parameterShown(trial.injectionNo || fallbackNumber)}</td>${cells}<td>${trial.isSuggested ? "" : recommendation}</td><td>${action}</td></tr>`;
}
function renderLatest(data) {
  const pressure = data.pressure === null ? "Not found" : `${data.pressure.toFixed(3)} psi`;
  $("metrics").innerHTML = [
    ["No. of peaks", shown(data.peakCount)],
    ["Run time (retention time of the last peak)", shown(decisionRunTime(data), " min")],
    ["Lowest resolution", shown(data.resolution, " Rmin")],
    ["Back-pressure", pressure]
  ].map(([label, value]) => `<div class="metric"><small>${label}</small><strong>${value}</strong></div>`).join("");
  $("decision").textContent = data.recommendation;
  $("runDetails").hidden = false;
  renderEquipment();
}
function clearCurrentView() {
  $("metrics").innerHTML = "";
  $("decision").textContent = "";
  $("runDetails").hidden = false;
  renderEquipment();
}
async function readFile(file) {
  if (file.name.toLowerCase().endsWith(".xlsx")) {
    if (!window.XLSX) throw new Error("The XLSX converter could not be loaded. Connect to the internet and try again.");
    const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
    return workbook.SheetNames.flatMap(name => XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, raw: false, defval: "" }));
  }
  return csvRows(await file.text());
}
$("runFile").addEventListener("change", async event => {
  const file = event.target.files[0]; if (!file) return;
  $("fileName").textContent = file.name; $("error").hidden = true;
  try {
    const data = parseRun(await readFile(file), file.name); trials.push(data); currentViewedTrialIndex = null; parameterTrialIndex = trials.length - 1; updateRecommendation(data);
    renderParameters(data); clearCurrentView(); renderTrials();
  } catch (error) { $("error").textContent = error.message; $("error").hidden = false; }
});
["peakSpec", "timeSpec", "resolutionSpec", "pressureSpec"].forEach(id => $(id).addEventListener("change", () => {
  trials.forEach(updateRecommendation); renderTrials();
  if (currentViewedTrialIndex !== null) renderLatest(trials[currentViewedTrialIndex]);
  else renderEquipment();
}));
document.querySelectorAll("[data-app-tab]").forEach(button => button.addEventListener("click", () => {
const activeView = button.dataset.appTab;
document.querySelectorAll("[data-app-tab]").forEach(tab => {
  const selected = tab === button;
  tab.classList.toggle("active", selected);
  tab.setAttribute("aria-selected", String(selected));
});
$("analysisView").hidden = activeView !== "analysisView";
$("equipmentView").hidden = activeView !== "equipmentView";
if (activeView === "equipmentView") renderEquipment();
}));
document.querySelectorAll("[data-equipment-module]").forEach(button => button.addEventListener("click", () => {
activeEquipmentModule = button.dataset.equipmentModule;
const module = equipmentModules[activeEquipmentModule];
activeEquipmentParameter = module && module.parameters.length ? module.parameters[0].name : "";
renderEquipment();
}));
$("equipmentDetails").addEventListener("change", event => {
  if (event.target.id !== "equipmentParameter") return;
  activeEquipmentParameter = event.target.value;
  renderEquipment();
});
$("equipmentLayout").addEventListener("click", event => {
  const button = event.target.closest("[data-injector-image]");
  if (!button) return;
  activeInjectorImage = button.dataset.injectorImage;
  renderEquipment();
});
$("trialTable").addEventListener("click", event => {
  const sourceRow = event.target.closest(".source-trial");
  if (sourceRow && !event.target.closest("button")) {
    const trial = trials[Number(sourceRow.dataset.sourceIndex)];
    if (trial) {
      currentViewedTrialIndex = Number(sourceRow.dataset.sourceIndex);
      parameterTrialIndex = currentViewedTrialIndex;
      renderParameters(trial);
      renderLatest(trial);
      $("trialTable").querySelectorAll(".source-trial").forEach(row => row.classList.remove("selected-trial"));
      sourceRow.classList.add("selected-trial");
    }
    return;
  }
  const button = event.target.closest(".delete-suggestion");
  if (!button) return;
  deletedSuggestions.add(button.dataset.suggestionKey);
  renderTrials();
});
$("parameters").addEventListener("change", event => {
  const control = event.target.closest("[data-parameter-key]");
  if (!control || parameterTrialIndex === null) return;
  const trial = trials[parameterTrialIndex];
  if (!trial || trial.isSuggested) return;
  const key = control.dataset.parameterKey;
  const value = key === "setTemperature" && /^amb(?:ient)?$/i.test(control.value.trim())
    ? "25"
    : editableParameterNumberKeys.has(key)
      ? numeric(control.value) ?? ""
      : control.value.trim();
  trial[key] = value;
  if (key === "columnType") {
    trial.coreShell = /^raptor$/i.test(String(value).trim()) ? "Yes" : "No";
  }
  trials.slice(parameterTrialIndex).forEach(updateRecommendation);
  renderParameters(trial);
  renderTrials();
  if (currentViewedTrialIndex === parameterTrialIndex) renderLatest(trial);
  else renderEquipment();
});
$("trialTable").addEventListener("change", event => {
  const control = event.target.closest(".suggestion-percent, .suggestion-temperature, .prediction-percent, .minimum-intermediate-percent, .prediction-solvent, .prediction-solvent-text, .prediction-ligand");
  if (!control) return;
  const suggestionKey = control.dataset.suggestionKey;
  const trial = trials.find(item => `${trials.indexOf(item)}:0` === suggestionKey);
  if (!trial) return;
  if (control.classList.contains("suggestion-percent")) trial.nextPercentB = control.value === "intermediate" ? "" : Number(control.value);
  if (control.classList.contains("suggestion-temperature")) trial.suggestedTemperature = control.value;
  if (trial.prediction && control.classList.contains("prediction-percent")) trial.prediction.percentB = Number(control.value);
  if (control.classList.contains("minimum-intermediate-percent")) trial.minimumIntermediateSelection = Number(control.value);
  if (trial.prediction && control.classList.contains("prediction-solvent")) trial.prediction.solvent = control.value;
  if (trial.prediction && control.classList.contains("prediction-solvent-text")) trial.prediction.solvent = control.value;
  if (trial.prediction && control.classList.contains("prediction-ligand")) trial.prediction.ligand = control.value;
  renderTrials();
});
$("trialTable").addEventListener("input", event => {
  const control = event.target.closest(".prediction-solvent-text");
  if (!control) return;
  const trial = trials.find(item => `${trials.indexOf(item)}:0` === control.dataset.suggestionKey);
  if (trial?.prediction) trial.prediction.solvent = control.value;
});
renderParameters({ ligand: "-", columnType: "", coreShell: "", poreSize: "140", cLoad: "6", length: "-", diameter: "-", particleSize: "-", solvent: "-", percentB: "-", flow: "-", sampleConc: "-", setTemperature: "-", measuredTemperature: "-", wavelength: "-" });
renderEquipment();
