export type Module = {
  id: string;
  n: number;
  title: string;
  question: string;
  status: "Analyzing" | "Completed" | "Additional Data Needed";
  teaser: string;
  requiresUserData?: boolean;
};

export const MODULES: Module[] = [
  {
    id: "health",
    n: 1,
    title: "AI Property Health Score",
    question: "Should I protest my property?",
    status: "Completed",
    teaser: "Overall protest opportunity score based on valuation, comps, and county trends.",
  },
  {
    id: "strategy",
    n: 2,
    title: "AI Recommended Protest Strategy",
    question: "What is the best strategy to reduce my property taxes?",
    status: "Completed",
    teaser: "Best-fit approach: market value, unequal appraisal, or condition-based reduction.",
  },
  {
    id: "comps",
    n: 3,
    title: "Comparable Sales & Market Analysis",
    question: "How does my property compare with similar nearby commercial properties?",
    status: "Completed",
    teaser: "Filtered comparable sales and equity comps ranked by relevance.",
  },
  {
    id: "site",
    n: 4,
    title: "Site Condition Analysis",
    question: "Are there land or site-related issues that could support a lower valuation?",
    status: "Completed",
    teaser: "Access, drainage, easements, and other site factors that reduce market value.",
  },
  {
    id: "improvement",
    n: 5,
    title: "Improvement Condition Analysis",
    question: "Is the building being valued fairly based on its age and condition?",
    status: "Completed",
    teaser: "Effective age, deferred maintenance, and functional obsolescence review.",
  },
  {
    id: "zoning",
    n: 6,
    title: "Zoning & Property Classification Review",
    question: "Is the property being assessed under the correct zoning and classification?",
    status: "Completed",
    teaser: "Confirms CAD class code matches actual use and zoning designation.",
  },
  {
    id: "income",
    n: 7,
    title: "Income Approach & P&L Analysis",
    question: "Does the property's income support its current assessed value?",
    status: "Additional Data Needed",
    teaser: "Requires P&L, rent roll, or operating statement to complete.",
    requiresUserData: true,
  },
  {
    id: "evidence",
    n: 8,
    title: "AI Evidence Builder",
    question: "What evidence may provide the strongest support for a protest?",
    status: "Completed",
    teaser: "Prioritized evidence checklist with drafts and comp packet outline.",
  },
  {
    id: "savings",
    n: 9,
    title: "Estimated Tax Savings & ROI",
    question: "How much could I potentially save, and is filing a protest worthwhile?",
    status: "Completed",
    teaser: "Estimated reduction range, tax savings, and confidence tier.",
  },
  {
    id: "executive",
    n: 10,
    title: "AI Executive Protest Report",
    question: "What is the final AI recommendation and what should I do next?",
    status: "Completed",
    teaser: "Executive summary with a recommended next step and filing timeline.",
  },
];
