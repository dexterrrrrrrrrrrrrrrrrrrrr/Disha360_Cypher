export type Badge = {
  key: string;
  name: string;
  description: string;
  unlocked: boolean;
  earnedAt: string | null;
};
export type Engagement = {
  studentId: string;
  displayName?: string;
  totalPoints: number;
  completedAssessments: number;
  solvedCoding: number;
  completedModules: number;
  learningDatesUnknown?: number;
  breakdown: { assessments: number; coding: number; learning: number };
  streak: {
    current: number;
    longest: number;
    lastActiveDay: string | null;
    timezone: string;
  };
  badges: Badge[];
  rules: string;
};
export type LeaderboardRow = {
  studentId: string;
  displayName: string;
  rank: number;
  totalPoints: number;
  completedAssessments: number;
  solvedCoding: number;
  completedModules: number;
  badges: { key: string; name: string }[];
};
export type LeaderboardData = {
  rows: LeaderboardRow[];
  currentStudent: LeaderboardRow | null;
  total: number;
  page: number;
  totalPages: number;
  scope: string;
  rules: string;
  tieRule: string;
  statistics: {
    students: number;
    engagedStudents: number;
    totalPoints: number;
    badgeAwards: number;
  } | null;
};
