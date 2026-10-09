export interface CompanyProfile {
  id: string;
  name: string;
  overview: string;
  industry: string;
  disclaimer: string;
  demo: boolean;
  stages: string[];
  topics: {
    aptitude: string[];
    technical: string[];
    coding: string[];
    hr: string[];
  };
  interviewQuestions: string[];
  checklist: { key: string; label: string }[];
  progress: {
    completedItemKeys: string[];
    completed: number;
    total: number;
    percent: number;
  };
}
export interface CompanyResource {
  id: string;
  title: string;
  detail: string;
  href: string;
}
export interface CompanyResources {
  learning: CompanyResource[];
  coding: CompanyResource[];
  assessments: CompanyResource[];
  interview: { href: string; title: string; detail: string };
  explanation: string;
}
