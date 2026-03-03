export interface Annotation {
  id: string;
  type: "highlight" | "note" | "drawing";
  page: number;
  positions: Array<{
    x: number;
    y: number;
    width: number;
    height: number;
  }>;
  content: string;
  timestamp: number;
  color?: string;
  sentenceIds?: number[]; // Used for sentence highlighting
}

// Preset templates for different disciplines
export const disciplineTemplates = {
  "Computer Science": [
    {
      id: "cs-algorithm",
      name: "Algorithm & Complexity",
      color: "#FFCC153D",
      aiRules:
        "Identify algorithmic descriptions, time/space complexity analysis, and computational methods",
      isDefault: true,
    },
    {
      id: "cs-system",
      name: "System Architecture",
      color: "#F5695D3D",
      aiRules:
        "Mark system design patterns, architecture descriptions, and implementation details",
      isDefault: true,
    },
    {
      id: "cs-ml",
      name: "Machine Learning",
      color: "#0CAD373D",
      aiRules:
        "Identify model descriptions, training procedures, and performance metrics",
      isDefault: true,
    },
    {
      id: "cs-evaluation",
      name: "Experimental Results",
      color: "#E839F43D",
      aiRules:
        "Mark experimental setup, results analysis, and performance comparisons",
      isDefault: true,
    },
    {
      id: "cs-related-work",
      name: "Related Work",
      color: "#32AECA3D",
      aiRules:
        "Identify citations, comparative analysis, and literature positioning",
      isDefault: true,
    },
    {
      id: "cs-conclusion",
      name: "Conclusion & Future Work",
      color: "#9CA3AF",
      aiRules: "Mark conclusions, limitations, and future research directions",
      isDefault: true,
    },
  ],
  "Electric Engineering": [
    {
      id: "ee-circuit",
      name: "Circuit Design",
      color: "#FFCC153D",
      aiRules:
        "Identify circuit topologies, component specifications, and design methodologies",
      isDefault: true,
    },
    {
      id: "ee-signal",
      name: "Signal Processing",
      color: "#F5695D3D",
      aiRules:
        "Mark signal analysis, filtering techniques, and processing algorithms",
      isDefault: true,
    },
    {
      id: "ee-power",
      name: "Power Systems",
      color: "#0CAD373D",
      aiRules:
        "Identify power management, efficiency analysis, and energy conversion",
      isDefault: true,
    },
    {
      id: "ee-control",
      name: "Control Systems",
      color: "#E839F43D",
      aiRules: "Mark control theory, feedback systems, and stability analysis",
      isDefault: true,
    },
    {
      id: "ee-measurement",
      name: "Measurements",
      color: "#32AECA3D",
      aiRules:
        "Identify experimental measurements, characterization, and validation",
      isDefault: true,
    },
    {
      id: "ee-application",
      name: "Applications",
      color: "#9CA3AF",
      aiRules:
        "Mark practical applications, use cases, and implementation examples",
      isDefault: true,
    },
  ],
  Mathematics: [
    {
      id: "math-theorem",
      name: "Theorems & Proofs",
      color: "#FFCC153D",
      aiRules: "Identify mathematical theorems, lemmas, and proof structures",
      isDefault: true,
    },
    {
      id: "math-definition",
      name: "Definitions",
      color: "#F5695D3D",
      aiRules: "Mark mathematical definitions, concepts, and formal statements",
      isDefault: true,
    },
    {
      id: "math-formula",
      name: "Formulas & Equations",
      color: "#0CAD373D",
      aiRules: "Identify key mathematical formulas, equations, and expressions",
      isDefault: true,
    },
    {
      id: "math-example",
      name: "Examples & Applications",
      color: "#E839F43D",
      aiRules: "Mark worked examples, applications, and illustrative cases",
      isDefault: true,
    },
    {
      id: "math-method",
      name: "Methods & Algorithms",
      color: "#32AECA3D",
      aiRules:
        "Identify computational methods, algorithms, and solution procedures",
      isDefault: true,
    },
    {
      id: "math-results",
      name: "Results & Analysis",
      color: "#9CA3AF",
      aiRules: "Mark mathematical results, analysis, and conclusions",
      isDefault: true,
    },
  ],
  Biology: [
    {
      id: "bio-organism",
      name: "Organisms & Species",
      color: "#FFCC153D",
      aiRules:
        "Identify species names, taxonomic information, and biological entities",
      isDefault: true,
    },
    {
      id: "bio-mechanism",
      name: "Biological Mechanisms",
      color: "#F5695D3D",
      aiRules: "Mark biological processes, molecular mechanisms, and pathways",
      isDefault: true,
    },
    {
      id: "bio-experiment",
      name: "Experimental Methods",
      color: "#0CAD373D",
      aiRules: "Identify experimental procedures, protocols, and methodologies",
      isDefault: true,
    },
    {
      id: "bio-data",
      name: "Data & Statistics",
      color: "#E839F43D",
      aiRules:
        "Mark statistical analysis, data interpretation, and quantitative results",
      isDefault: true,
    },
    {
      id: "bio-genetics",
      name: "Genetics & Genomics",
      color: "#32AECA3D",
      aiRules:
        "Identify genetic information, genomic analysis, and molecular biology",
      isDefault: true,
    },
    {
      id: "bio-ecology",
      name: "Ecology & Environment",
      color: "#9CA3AF",
      aiRules:
        "Mark ecological relationships, environmental factors, and ecosystem analysis",
      isDefault: true,
    },
  ],
};